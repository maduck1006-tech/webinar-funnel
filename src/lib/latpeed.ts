import crypto from "node:crypto";
import { z } from "zod";

/**
 * 래피드(Latpeed) 웹훅 검증 (PRD 4.2)
 *
 * 래피드는 공개 서명 스펙이 명확하지 않아, 아래 두 방식을 모두 허용한다:
 *  1) HMAC-SHA256 서명 헤더(X-Latpeed-Signature) — base string 후보 여러 개를 시도
 *  2) 공유 토큰 방식 — 헤더(X-Latpeed-Token) 또는 쿼리(?token=)가 시크릿과 일치
 *
 * 첫 실제 결제가 들어오면 어떤 방식/포맷이 맞았는지 로그(method)로 남으므로,
 * 그때 이 파일을 해당 방식만 남기도록 축소하면 된다.
 */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

type VerifyResult = {
  valid: boolean;
  method?: string; // 어떤 방식으로 통과했는지 (로그용)
  reason?: string;
};

function safeEqualStr(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function verifyLatpeedSignature(params: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  token: string | null;
  secret: string;
}): VerifyResult {
  const { rawBody, timestamp, signature, token, secret } = params;
  if (!secret) return { valid: false, reason: "secret not configured" };

  // --- 방식 2: 공유 토큰 ---
  if (token && safeEqualStr(token, secret)) {
    return { valid: true, method: "shared-token" };
  }

  // --- 방식 1: HMAC 서명 ---
  if (!signature) {
    return { valid: false, reason: "no signature / token" };
  }

  // timestamp 허용 오차 (헤더가 있을 때만 검사)
  if (timestamp) {
    const ts = Number(timestamp);
    if (Number.isFinite(ts)) {
      const tsMs = String(timestamp).trim().length <= 10 ? ts * 1000 : ts;
      if (Math.abs(Date.now() - tsMs) > TIMESTAMP_TOLERANCE_MS) {
        return { valid: false, reason: "timestamp out of tolerance" };
      }
    }
  }

  const baseStrings: [string, string][] = [
    ["ts.body", `${timestamp}.${rawBody}`],
    ["body", rawBody],
    ["ts+body", `${timestamp}${rawBody}`],
    ["body+ts", `${rawBody}${timestamp}`],
  ];
  const sig = signature.trim().replace(/^sha256=/i, "");

  for (const [name, base] of baseStrings) {
    const hex = crypto.createHmac("sha256", secret).update(base).digest("hex");
    const b64 = crypto.createHmac("sha256", secret).update(base).digest("base64");
    if (safeEqualStr(sig.toLowerCase(), hex.toLowerCase())) {
      return { valid: true, method: `hmac:${name}:hex` };
    }
    if (safeEqualStr(sig, b64)) {
      return { valid: true, method: `hmac:${name}:base64` };
    }
  }

  return { valid: false, reason: "signature mismatch (all formats)" };
}

export const latpeedWebhookSchema = z.object({
  type: z.enum(["NORMAL_PAYMENT", "MEMBERSHIP_PAYMENT"]),
  payment: z.object({
    orderId: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    amount: z.number(),
    status: z.enum(["SUCCESS", "CANCEL"]),
    date: z.string().optional(),
    method: z.string().optional(),
    option: z.string().optional(),
  }),
});

export type LatpeedWebhook = z.infer<typeof latpeedWebhookSchema>;

/** 010-1234-5678 / +82 10... 등 → 01012345678 로 정규화 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
}
