import "server-only";
import crypto from "node:crypto";

export type TossConfirmResult = {
  paymentKey: string;
  orderId: string;
  status: string;
  method: string;
  totalAmount: number;
  approvedAt: string | null;
};

/**
 * 토스 결제 승인 API 호출.
 * Authorization: Basic base64(SECRET_KEY:)
 * 성공 시 Payment 객체 반환, 실패 시 throw.
 */
export async function confirmTossPayment({
  paymentKey,
  orderId,
  amount,
}: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmResult> {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error("TOSS_SECRET_KEY 미설정");

  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
    cache: "no-store",
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const code = data.code ?? "UNKNOWN";
    const msg = data.message ?? res.statusText;
    throw new Error(`toss confirm 실패 [${code}]: ${msg}`);
  }
  return {
    paymentKey: String(data.paymentKey),
    orderId: String(data.orderId),
    status: String(data.status),
    method: String(data.method ?? ""),
    totalAmount: Number(data.totalAmount ?? amount),
    approvedAt: data.approvedAt ? String(data.approvedAt) : null,
  };
}

/** toss_<uuid> 형식 주문번호 생성 (영문+숫자+하이픈, 6~64자 제약 충족) */
export function generateTossOrderId(): string {
  return `toss_${crypto.randomUUID()}`;
}
