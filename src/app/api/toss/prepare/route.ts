import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads, pendingOrders, products } from "@/db/schema";
import { generateTossOrderId } from "@/lib/toss";
import { validateCoupon } from "@/lib/coupons";
import { getProductOffers } from "@/lib/funnel-offer";

export const runtime = "nodejs";

/**
 * 결제 직전 주문 생성. 금액을 서버에서 계산(본상품 + 오더 범프)해 pending_orders 에 저장.
 * successUrl 리다이렉트 시 /api/toss/confirm 이 이 금액과 대조해 위변조를 차단한다.
 */
const schema = z.object({
  productId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  withBump: z.boolean().optional(),
  role: z.enum(["main", "upsell", "downsell"]).optional(),
  couponCode: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { productId, leadId, withBump, role = "main", couponCode } = parsed.data;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product || !product.active) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  let campaignId: string | null = null;
  if (leadId) {
    const [l] = await db
      .select({ c: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    campaignId = l?.c ?? null;
  }

  // 업셀·다운셀엔 오더 범프 없음. 범프는 이 캠페인 기준.
  let bumpAmount = 0;
  let bumpProductId: string | null = null;
  if (role === "main" && withBump) {
    const offers = await getProductOffers(product.id, campaignId);
    if (offers.bumpProductId) {
      const [bp] = await db
        .select()
        .from(products)
        .where(eq(products.id, offers.bumpProductId))
        .limit(1);
      if (bp && bp.active) {
        bumpAmount = bp.price;
        bumpProductId = bp.id;
      }
    }
  }

  const gross = product.price + bumpAmount;

  // 쿠폰 (본상품 결제에만). 서버에서 재검증.
  let couponId: string | null = null;
  let discount = 0;
  if (couponCode && role === "main") {
    const c = await validateCoupon({
      code: couponCode,
      productId: product.id,
      amount: gross,
      leadId: leadId ?? null,
    });
    if (c.ok) {
      couponId = c.coupon.id;
      discount = c.discount;
    }
    // 쿠폰이 무효면 조용히 무시(정가 결제) — 클라가 이미 미리보기로 걸렀음
  }

  const amount = Math.max(100, gross - discount); // 토스 최소 결제액 대비

  const orderId = generateTossOrderId();
  await db.insert(pendingOrders).values({
    orderId,
    campaignId,
    leadId: leadId ?? null,
    productId: product.id,
    amount,
    bumpProductId,
    bumpAmount: bumpProductId ? bumpAmount : null,
    role,
    couponId,
    discount,
  });

  const baseName = product.tossOrderName || product.name;
  return NextResponse.json({
    orderId,
    amount,
    discount,
    orderName: bumpProductId ? `${baseName} 외 1건` : baseName,
  });
}
