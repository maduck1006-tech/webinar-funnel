import crypto from "node:crypto";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";

/**
 * Meta Conversions API — 서버측 전환 이벤트 전송.
 *
 * 픽셀(브라우저 fbq)과 같은 event_id 를 쓰면 Meta 가 중복 제거한다.
 *  - Lead    : `lead.<leadId>`
 *  - Purchase: `purchase.lead.<leadId>` (없으면 `purchase.order.<orderId>`)
 *  - Schedule: `schedule.<code|leadId>`
 *
 * env: META_CAPI_TOKEN (없으면 META_ACCESS_TOKEN), META_DEFAULT_PIXEL_ID(옵션),
 *      META_CAPI_TEST_CODE(테스트 이벤트 탭 검증용, 있으면 실집계 안 됨)
 * 전송 결과는 webhook_events(provider='meta_capi') 에 기록.
 */

const API_VERSION = "v21.0";

function sha256(v: string) {
  return crypto.createHash("sha256").update(v).digest("hex");
}
/** 이메일/이름 등 일반 문자열: trim + lowercase 후 해시 */
function hashNorm(v?: string | null) {
  const s = v?.trim().toLowerCase();
  return s ? sha256(s) : undefined;
}
/** 전화: 숫자만, 국내 0 접두 → 82, + 없이 해시 */
function hashPhone(v?: string | null) {
  if (!v) return undefined;
  let d = v.replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = `82${d.slice(1)}`;
  return d ? sha256(d) : undefined;
}

export type MetaEventName =
  | "Lead"
  | "Purchase"
  | "Schedule"
  | "InitiateCheckout";

export type MetaEventInput = {
  pixelId?: string | null;
  eventName: MetaEventName;
  eventId: string;
  eventTime?: number; // 초 단위, 기본 now
  actionSource?: "website" | "system_generated" | "other";
  eventSourceUrl?: string | null;
  user: {
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    clientIp?: string | null;
    clientUa?: string | null;
    /** 우리 leadId 등 — external_id 로 해싱해 전송 */
    externalId?: string | null;
  };
  custom?: {
    value?: number;
    currency?: string;
    content_name?: string;
    [k: string]: unknown;
  };
};

export async function sendMetaEvent(
  input: MetaEventInput,
): Promise<{ ok: boolean; error?: string }> {
  const pixelId = input.pixelId || process.env.META_DEFAULT_PIXEL_ID;
  const token =
    process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!pixelId || !token) {
    return { ok: false, error: "capi 미설정 (pixelId/token)" };
  }

  const u = input.user;
  const userData: Record<string, unknown> = {};
  const em = hashNorm(u.email);
  if (em) userData.em = [em];
  const ph = hashPhone(u.phone);
  if (ph) userData.ph = [ph];
  const fn = hashNorm(u.firstName);
  if (fn) userData.fn = [fn];
  const ext = hashNorm(u.externalId);
  if (ext) userData.external_id = [ext];
  if (u.fbc) userData.fbc = u.fbc;
  if (u.fbp) userData.fbp = u.fbp;
  if (u.clientIp) userData.client_ip_address = u.clientIp;
  if (u.clientUa) userData.client_user_agent = u.clientUa;

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    action_source: input.actionSource ?? "website",
    user_data: userData,
  };
  if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;
  if (input.custom) event.custom_data = input.custom;

  const body: Record<string, unknown> = { data: [event] };
  if (process.env.META_CAPI_TEST_CODE) {
    body.test_event_code = process.env.META_CAPI_TEST_CODE;
  }

  let ok = false;
  let errMsg: string | undefined;
  let response: unknown = null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    response = await res.json().catch(() => ({}));
    const r = response as { error?: { message?: string } };
    ok = res.ok && !r.error;
    if (!ok) errMsg = r.error?.message ?? `HTTP ${res.status}`;
  } catch (e) {
    errMsg = String(e);
  }

  try {
    await db.insert(webhookEvents).values({
      provider: "meta_capi",
      type: input.eventName,
      status: ok ? "sent" : "failed",
      signatureValid: true,
      payload: {
        event_id: input.eventId,
        pixel_id: pixelId,
        request: event,
        response,
      },
      processedAt: new Date(),
      error: ok ? null : `capi: ${errMsg}`,
    });
  } catch {
    /* 로그 실패가 흐름을 막지 않음 */
  }

  return ok ? { ok: true } : { ok: false, error: errMsg };
}
