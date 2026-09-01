import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couponRedemptions, coupons, type Coupon } from "@/db/schema";

export type CouponCheck =
  | {
      ok: true;
      coupon: Coupon;
      discount: number;
      finalAmount: number;
    }
  | { ok: false; reason: string };

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function calcDiscount(c: Coupon, amount: number): number {
  const d =
    c.type === "percent"
      ? Math.floor((amount * c.value) / 100)
      : c.value;
  return Math.max(0, Math.min(d, amount)); // 주문액을 넘지 않음
}

/**
 * 쿠폰 검증 (서버 전용 — 클라 금액 신뢰 안 함).
 * amount = 본상품 + 오더범프 합산 (할인 전).
 */
export async function validateCoupon(opts: {
  code: string;
  productId: string;
  amount: number;
  leadId?: string | null;
}): Promise<CouponCheck> {
  const code = normalizeCode(opts.code);
  if (!code) return { ok: false, reason: "쿠폰 코드를 입력해 주세요." };

  const [c] = await db.select().from(coupons).where(eq(coupons.code, code));
  if (!c || !c.active) {
    return { ok: false, reason: "사용할 수 없는 쿠폰이에요." };
  }

  const now = new Date();
  if (c.startsAt && c.startsAt > now) {
    return { ok: false, reason: "아직 사용 기간이 아니에요." };
  }
  if (c.endsAt && c.endsAt < now) {
    return { ok: false, reason: "사용 기간이 지난 쿠폰이에요." };
  }
  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) {
    return { ok: false, reason: "쿠폰이 모두 소진됐어요." };
  }
  if (c.productIds && c.productIds.length > 0 && !c.productIds.includes(opts.productId)) {
    return { ok: false, reason: "이 상품에는 쓸 수 없는 쿠폰이에요." };
  }
  if (c.minAmount != null && opts.amount < c.minAmount) {
    return {
      ok: false,
      reason: `${c.minAmount.toLocaleString()}원 이상 주문에만 쓸 수 있어요.`,
    };
  }
  if (opts.leadId) {
    const [used] = await db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, c.id),
          eq(couponRedemptions.leadId, opts.leadId),
        ),
      )
      .limit(1);
    if (used) return { ok: false, reason: "이미 사용한 쿠폰이에요." };
  }

  const discount = calcDiscount(c, opts.amount);
  if (discount <= 0) {
    return { ok: false, reason: "할인이 적용되지 않는 주문이에요." };
  }

  return {
    ok: true,
    coupon: c,
    discount,
    finalAmount: opts.amount - discount,
  };
}

/** 결제 성공 후 쿠폰 사용 확정 (재실행 안전 — orderId 로 중복 방지) */
export async function redeemCoupon(opts: {
  couponId: string;
  leadId: string | null;
  orderId: string;
  discount: number;
}): Promise<void> {
  const [dup] = await db
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.orderId, opts.orderId))
    .limit(1);
  if (dup) return;

  await db.insert(couponRedemptions).values({
    couponId: opts.couponId,
    leadId: opts.leadId,
    orderId: opts.orderId,
    discount: opts.discount,
  });
  await db
    .update(coupons)
    .set({ redeemedCount: sql`${coupons.redeemedCount} + 1` })
    .where(eq(coupons.id, opts.couponId));
}
