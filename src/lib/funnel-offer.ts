import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, products } from "@/db/schema";

export type Offer = {
  productId: string;
  name: string;
  price: number;
  compareAt: number | null;
  /** 결제 페이지 URL (없으면 null → CTA 는 그대로 둠) */
  checkoutUrl: string | null;
};

/**
 * 캠페인의 현재 노출 저가 상품 1개.
 * - campaign_products 매핑 + placement 일치 (또는 'both')
 * - products.active = true, 노출기간(showFrom/showUntil) 이내
 */
export async function getActiveOffer(
  campaignId: string,
  placement: "thankyou" | "vod_bottom",
): Promise<Offer | null> {
  try {
    const now = new Date();
    const rows = await db
      .select({ p: products, cpPlacement: campaignProducts.placement })
      .from(campaignProducts)
      .innerJoin(products, eq(products.id, campaignProducts.productId))
      .where(
        and(
          eq(campaignProducts.campaignId, campaignId),
          inArray(campaignProducts.placement, ["both", placement]),
          eq(products.active, true),
          or(isNull(products.showFrom), lte(products.showFrom, now)),
          or(isNull(products.showUntil), gt(products.showUntil, now)),
        ),
      )
      .orderBy(asc(campaignProducts.sortOrder), asc(products.createdAt))
      .limit(1);
    const p = rows[0]?.p;
    if (!p) return null;
    return {
      productId: p.id,
      name: p.name,
      price: p.price,
      compareAt: p.compareAtPrice,
      checkoutUrl: p.latpeedCheckoutUrl ?? null,
    };
  } catch {
    return null;
  }
}

/** 결제 URL 에 lead 식별자 붙이기 (결제 서비스가 리다이렉트로 전달해줄 경우 대비) */
export function checkoutUrlWithLead(url: string, leadId?: string | null): string {
  if (!leadId) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("l", leadId);
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + "l=" + leadId;
  }
}
