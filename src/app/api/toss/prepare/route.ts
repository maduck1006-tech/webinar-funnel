import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leads, pendingOrders, products } from "@/db/schema";
import { generateTossOrderId } from "@/lib/toss";

export const runtime = "nodejs";

/**
 * 결제 직전 주문 생성. 금액을 서버에서 계산(본상품 + 오더 범프)해 pending_orders 에 저장.
 * successUrl 리다이렉트 시 /api/toss/confirm 이 이 금액과 대조해 위변조를 차단한다.
 */
const schema = z.object({
  productId: z.string().uuid(),
  leadId: z.string().uuid().nullable().optional(),
  withBump: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { productId, leadId, withBump } = parsed.data;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product || !product.active || product.paymentProvider !== "toss") {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  let bumpAmount = 0;
  let bumpProductId: string | null = null;
  if (withBump && product.bumpProductId) {
    const [bp] = await db
      .select()
      .from(products)
      .where(eq(products.id, product.bumpProductId))
      .limit(1);
    if (bp && bp.active) {
      bumpAmount = bp.price;
      bumpProductId = bp.id;
    }
  }

  const amount = product.price + bumpAmount;

  let campaignId: string | null = null;
  if (leadId) {
    const [l] = await db
      .select({ c: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    campaignId = l?.c ?? null;
  }

  const orderId = generateTossOrderId();
  await db.insert(pendingOrders).values({
    orderId,
    campaignId,
    leadId: leadId ?? null,
    productId: product.id,
    amount,
    bumpProductId,
    bumpAmount: bumpProductId ? bumpAmount : null,
  });

  const baseName = product.tossOrderName || product.name;
  return NextResponse.json({
    orderId,
    amount,
    orderName: bumpProductId ? `${baseName} 외 1건` : baseName,
  });
}
