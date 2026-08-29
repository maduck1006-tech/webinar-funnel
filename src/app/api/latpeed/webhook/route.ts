import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignProducts,
  leads,
  orders,
  products,
  webhookEvents,
} from "@/db/schema";
import {
  latpeedWebhookSchema,
  normalizePhone,
  verifyLatpeedSignature,
} from "@/lib/latpeed";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const url = new URL(req.url);
  const { valid, reason, method } = verifyLatpeedSignature({
    rawBody,
    timestamp: req.headers.get("x-latpeed-timestamp"),
    signature: req.headers.get("x-latpeed-signature"),
    token:
      req.headers.get("x-latpeed-token") ??
      url.searchParams.get("token") ??
      null,
    secret: process.env.LATPEED_WEBHOOK_SECRET ?? "",
  });
  if (valid && method) {
    console.info(`[latpeed.webhook] verified via ${method}`);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    /* keep null */
  }

  const parsed = latpeedWebhookSchema.safeParse(payload);
  const [logRow] = await db
    .insert(webhookEvents)
    .values({
      type: parsed.success ? parsed.data.type : null,
      status: parsed.success ? parsed.data.payment.status : null,
      signatureValid: valid,
      payload: (payload ?? { raw: rawBody }) as object,
      error: valid ? `verified: ${method}` : `signature: ${reason}`,
    })
    .returning({ id: webhookEvents.id });

  // 서명 실패해도 로그는 남기고 200 (재시도 폭주 방지). 처리는 중단.
  if (!valid) {
    reportError("latpeed.webhook", `signature invalid: ${reason}`, {
      eventId: logRow.id,
    });
    return NextResponse.json({ ok: true, ignored: "invalid signature" });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: true, ignored: "unparseable payload" });
  }

  try {
    return await handlePayment(parsed.data, logRow.id);
  } catch (e) {
    reportError("latpeed.webhook", e, { eventId: logRow.id });
    await db
      .update(webhookEvents)
      .set({ error: `processing: ${String(e)}` })
      .where(eq(webhookEvents.id, logRow.id));
    // 500 → 래피드가 재시도하도록
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function handlePayment(
  { type, payment }: import("@/lib/latpeed").LatpeedWebhook,
  logRowId: string,
) {
  const logRow = { id: logRowId };

  // 이번 범위: 단건 저가상품(NORMAL_PAYMENT)만 처리 (PRD 4.2 TBD)
  if (type !== "NORMAL_PAYMENT") {
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: "membership - out of scope" })
      .where(eq(webhookEvents.id, logRow.id));
    return NextResponse.json({ ok: true, ignored: "membership" });
  }

  const email = payment.email?.trim().toLowerCase();
  const phone = normalizePhone(payment.phoneNumber);

  // 2단계 DB 레코드 매칭 (email 또는 phone)
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      or(
        email ? eq(leads.email, email) : undefined,
        phone ? eq(leads.phone, phone) : undefined,
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);

  // 상품 매칭: lead 캠페인의 연결 상품 우선, 없으면 전역 활성 상품
  let product:
    | typeof products.$inferSelect
    | undefined;
  if (lead?.campaignId) {
    const [r] = await db
      .select({ p: products })
      .from(campaignProducts)
      .innerJoin(products, eq(products.id, campaignProducts.productId))
      .where(eq(campaignProducts.campaignId, lead.campaignId))
      .orderBy(campaignProducts.sortOrder)
      .limit(1);
    product = r?.p;
  }
  if (!product) {
    [product] = await db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .limit(1);
  }

  // 주문 upsert (idempotent by latpeedOrderId)
  await db
    .insert(orders)
    .values({
      campaignId: lead?.campaignId ?? null,
      leadId: lead?.id,
      productId: product?.id,
      latpeedOrderId: payment.orderId,
      email,
      phone,
      amount: payment.amount,
      status: payment.status === "SUCCESS" ? "success" : "cancel",
      method: payment.method,
      paidAt: payment.date ? new Date(payment.date) : new Date(),
    })
    .onConflictDoUpdate({
      target: orders.latpeedOrderId,
      set: { status: payment.status === "SUCCESS" ? "success" : "cancel" },
    });

  if (payment.status === "SUCCESS" && lead) {
    // 4단계 접근 권한은 lead.status 로 관리 (웹훅 기반 자동 부여)
    await db
      .update(leads)
      .set({ status: "purchased", updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
    // 결제완료 문자는 발송하지 않음 (래피드 자체 감사문자로 충분)
  }

  // CANCEL(환불) 정책 (PRD Open Q6):
  //  - VOD 접근 자체는 lead 존재 + 48h 창으로 판정하므로 회수 대상 아님(구매/비구매 동일 콘텐츠).
  //  - 상태만 결제완료 → 구매안함 으로 되돌리고, 관리자 알림(자동화 트리거 ON일 때).
  if (payment.status === "CANCEL" && lead) {
    if (["purchased", "booked", "consulted"].includes(lead.status)) {
      await db
        .update(leads)
        .set({ status: "no_purchase", updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
    }
    // 결제취소 관리자 알림 문자는 발송하지 않음
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, logRow.id));

  return NextResponse.json({ ok: true });
}
