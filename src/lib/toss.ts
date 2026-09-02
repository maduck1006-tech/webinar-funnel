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
    const code = String(data.code ?? "UNKNOWN");
    const msg = data.message ?? res.statusText;
    const err = new Error(`toss confirm 실패 [${code}]: ${msg}`) as Error & {
      tossCode?: string;
    };
    err.tossCode = code;
    throw err;
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

function tossAuthHeader() {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error("TOSS_SECRET_KEY 미설정");
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export type TossBillingKey = {
  billingKey: string;
  customerKey: string;
  cardCompany: string | null;
  cardNumber: string | null;
};

/**
 * 빌링키 발급 — requestBillingAuth 리다이렉트로 받은 authKey 를 billingKey 로 교환.
 * POST /v1/billing/authorizations/issue  { authKey, customerKey }
 * (docs/toss-payments-plan.md §11 · 보완 5/5)
 */
export async function issueBillingKey({
  authKey,
  customerKey,
}: {
  authKey: string;
  customerKey: string;
}): Promise<TossBillingKey> {
  const res = await fetch(
    "https://api.tosspayments.com/v1/billing/authorizations/issue",
    {
      method: "POST",
      headers: {
        Authorization: tossAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ authKey, customerKey }),
      cache: "no-store",
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `toss billing issue 실패 [${data.code ?? "UNKNOWN"}]: ${data.message ?? res.statusText}`,
    );
  }
  const card = (data.card ?? {}) as Record<string, unknown>;
  return {
    billingKey: String(data.billingKey),
    customerKey: String(data.customerKey ?? customerKey),
    cardCompany: card.company ? String(card.company) : null,
    cardNumber: card.number ? String(card.number) : null,
  };
}

/**
 * 빌링키로 정기결제 청구.
 * POST /v1/billing/{billingKey}  { customerKey, amount, orderId, orderName }
 */
export async function chargeBillingKey({
  billingKey,
  customerKey,
  amount,
  orderId,
  orderName,
}: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
}): Promise<TossConfirmResult> {
  const res = await fetch(
    `https://api.tosspayments.com/v1/billing/${encodeURIComponent(billingKey)}`,
    {
      method: "POST",
      headers: {
        Authorization: tossAuthHeader(),
        "Content-Type": "application/json",
        "Idempotency-Key": orderId,
      },
      body: JSON.stringify({ customerKey, amount, orderId, orderName }),
      cache: "no-store",
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `toss billing charge 실패 [${data.code ?? "UNKNOWN"}]: ${data.message ?? res.statusText}`,
    );
  }
  return {
    paymentKey: String(data.paymentKey),
    orderId: String(data.orderId),
    status: String(data.status),
    method: String(data.method ?? "간편결제"),
    totalAmount: Number(data.totalAmount ?? amount),
    approvedAt: data.approvedAt ? String(data.approvedAt) : null,
  };
}
