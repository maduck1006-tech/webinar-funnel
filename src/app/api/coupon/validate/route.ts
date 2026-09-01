import { NextResponse } from "next/server";
import { z } from "zod";
import { validateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(1).max(40),
  productId: z.string().uuid(),
  amount: z.number().int().positive(),
  leadId: z.string().uuid().nullable().optional(),
});

/** 체크아웃에서 쿠폰 미리보기용. 실제 적용은 /api/toss/prepare 가 서버에서 재검증 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }
  const r = await validateCoupon(parsed.data);
  if (!r.ok) return NextResponse.json(r, { status: 200 });
  return NextResponse.json({
    ok: true,
    discount: r.discount,
    finalAmount: r.finalAmount,
    label:
      r.coupon.type === "percent"
        ? `${r.coupon.value}% 할인`
        : `${r.coupon.value.toLocaleString()}원 할인`,
  });
}
