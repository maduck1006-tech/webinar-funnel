import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  leads,
  orders,
  pendingOrders,
  products,
} from "@/db/schema";
import { confirmTossPayment } from "@/lib/toss";
import { sendMetaEvent } from "@/lib/meta-capi";
import { enrollLead, stopAutomations } from "@/lib/messaging";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";

/** 토스 successUrl 리다이렉트 처리: paymentKey, orderId, amount 쿼리로 전달됨 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentKey = url.searchParams.get("paymentKey") ?? "";
  const orderId = url.searchParams.get("orderId") ?? "";
  const amountStr = url.searchParams.get("amount") ?? "0";
  const amount = Number(amountStr);

  if (!paymentKey || !orderId) {
    return redirectFail("INVALID_PARAMS", "paymentKey 또는 orderId 누락", url);
  }

  // 1. pending_orders 조회 → amount 위변조 검증
  const [pending] = await db
    .select()
    .from(pendingOrders)
    .where(eq(pendingOrders.orderId, orderId))
    .limit(1);

  if (!pending) {
    return redirectFail("ORDER_NOT_FOUND", "주문 정보를 찾을 수 없습니다", url);
  }
  if (pending.amount !== amount) {
    reportError("toss.confirm", `amount mismatch: expected=${pending.amount} got=${amount}`, { orderId });
    return redirectFail("AMOUNT_MISMATCH", "결제 금액이 일치하지 않습니다", url);
  }

  // 2. 이미 처리된 주문 (멱등 — 새로고침 대응)
  const [existingOrder] = await db
    .select({ id: orders.id, leadId: orders.leadId })
    .from(orders)
    .where(eq(orders.tossPaymentKey, paymentKey))
    .limit(1);

  if (existingOrder) {
    return redirectToVod(pending);
  }

  // 3. 토스 승인 API 호출
  let confirmed;
  try {
    confirmed = await confirmTossPayment({ paymentKey, orderId, amount });
  } catch (e) {
    reportError("toss.confirm", e, { orderId, paymentKey });
    return redirectFail("CONFIRM_FAILED", String(e), url);
  }

  if (confirmed.status !== "DONE") {
    // 가상계좌 등 비즉시 결제는 P1 미지원
    reportError("toss.confirm", `unexpected status: ${confirmed.status}`, { orderId });
    return redirectFail("PAYMENT_PENDING", `결제 상태(${confirmed.status}) 처리 중입니다. 잠시 후 시청 페이지를 확인하세요.`, url);
  }

  // 4. orders insert
  const paidAt = confirmed.approvedAt ? new Date(confirmed.approvedAt) : new Date();
  await db.insert(orders).values({
    campaignId: pending.campaignId ?? null,
    leadId: pending.leadId ?? null,
    productId: pending.productId ?? null,
    provider: "toss",
    tossPaymentKey: paymentKey,
    orderRole: pending.role ?? "main",
    bumpProductId: pending.bumpProductId ?? null,
    bumpAmount: pending.bumpAmount ?? null,
    amount: confirmed.totalAmount,
    status: "success",
    method: confirmed.method,
    paidAt,
  }).onConflictDoNothing(); // unique(tossPaymentKey) — 재호출 무시

  // 5. pending_orders 완료 처리
  await db
    .update(pendingOrders)
    .set({ status: "done" })
    .where(eq(pendingOrders.orderId, orderId));

  // 이후 처리는 lead 있을 때만
  if (!pending.leadId) {
    return redirectAfterPurchase(pending);
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, pending.leadId))
    .limit(1);

  if (!lead) return redirectToVod(pending);

  const alreadyPurchased = ["purchased", "booked", "consulted"].includes(lead.status);
  const role = pending.role ?? "main";

  // 6. lead.status → purchased (본상품 결제일 때만)
  if (role === "main" && !alreadyPurchased) {
    await db
      .update(leads)
      .set({ status: "purchased", updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
  }

  // 7. Meta CApI Purchase — 역할별 event_id (업셀은 브라우저 픽셀 없음)
  {
    let pixelId: string | null | undefined;
    if (lead.campaignId) {
      const [c] = await db
        .select({ metaPixelId: campaigns.metaPixelId })
        .from(campaigns)
        .where(eq(campaigns.id, lead.campaignId));
      pixelId = c?.metaPixelId;
    }
    // 상품명 조회
    let productName: string | undefined;
    if (pending.productId) {
      const [p] = await db
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, pending.productId));
      productName = p?.name;
    }
    try {
      await sendMetaEvent({
        pixelId,
        eventName: "Purchase",
        eventId:
          role === "main"
            ? `purchase.lead.${lead.id}`
            : `purchase.${role}.${paymentKey}`,
        eventSourceUrl: lead.landingUrl ?? undefined,
        user: {
          email: lead.email,
          phone: lead.phone,
          firstName: lead.name ?? undefined,
          fbc: lead.fbc,
          fbp: lead.fbp,
          clientIp: lead.clientIp,
          clientUa: lead.clientUa,
          externalId: lead.id,
        },
        custom: {
          value: confirmed.totalAmount,
          currency: "KRW",
          content_name: productName,
        },
      });
    } catch {
      /* CApI 실패가 결제 완료 흐름을 막지 않음 */
    }
  }

  // 8. 결제 자동화 (본상품 결제일 때만): 완료 안내 문자 + 마감 리마인더 중단
  if (role === "main") {
    try {
      await enrollLead(lead.id, "purchase", lead.campaignId ?? null);
      await stopAutomations(lead.id, "purchase");
    } catch {
      /* 자동화 실패가 결제 완료 흐름을 막지 않음 */
    }
  }

  return redirectAfterPurchase(pending);
}

function getOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

function redirectFail(code: string, message: string, _reqUrl: URL) {
  const failUrl = new URL("/checkout/fail", getOrigin());
  failUrl.searchParams.set("code", code);
  failUrl.searchParams.set("message", message);
  return NextResponse.redirect(failUrl, { status: 302 });
}

async function basePathFor(campaignId: string | null) {
  if (!campaignId) return "";
  const [c] = await db
    .select({ slug: campaigns.slug, isDefault: campaigns.isDefault })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId));
  return c && !c.isDefault ? `/${c.slug}` : "";
}

async function redirectToVod(pending: {
  campaignId: string | null;
  leadId: string | null;
}) {
  const basePath = await basePathFor(pending.campaignId);
  const vodUrl = `${basePath}/vod?paid=1${pending.leadId ? `&l=${pending.leadId}` : ""}`;
  return NextResponse.redirect(new URL(vodUrl, getOrigin()), { status: 302 });
}

/**
 * 결제 완료 후 이동. 본상품(role=main)이고 원클릭 업셀(upsellProductId)이 걸려 있으면
 * 업셀 페이지로, 아니면 VOD 로. 업셀/다운셀 결제는 바로 VOD 로.
 */
async function redirectAfterPurchase(pending: {
  campaignId: string | null;
  leadId: string | null;
  productId: string | null;
  role: string;
}) {
  if (pending.role === "main" && pending.productId) {
    const [p] = await db
      .select({ upsellProductId: products.upsellProductId })
      .from(products)
      .where(eq(products.id, pending.productId));
    if (p?.upsellProductId) {
      const [up] = await db
        .select({ id: products.id, active: products.active })
        .from(products)
        .where(eq(products.id, p.upsellProductId));
      if (up?.active) {
        const basePath = await basePathFor(pending.campaignId);
        const qs = new URLSearchParams({ p: up.id });
        if (pending.leadId) qs.set("l", pending.leadId);
        return NextResponse.redirect(
          new URL(`${basePath}/checkout/upsell?${qs.toString()}`, getOrigin()),
          { status: 302 },
        );
      }
    }
  }
  return redirectToVod(pending);
}
