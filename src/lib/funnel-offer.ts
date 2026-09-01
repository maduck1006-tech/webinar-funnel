import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, products } from "@/db/schema";

export type Offer = {
  productId: string;
  name: string;
  price: number;
  compareAt: number | null;
  /** 'latpeed' | 'toss' — docs/toss-payments-plan.md §4 */
  provider: string;
  kind: string;
  /**
   * latpeed 결제 페이지 URL (provider='latpeed' 일 때만). 없으면 null.
   * toss 는 자체 /checkout 이라 여기서 URL 을 만들지 않고 resolveCheckoutUrl 이 처리.
   */
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
      provider: p.paymentProvider,
      kind: p.kind,
      checkoutUrl:
        p.paymentProvider === "latpeed" ? (p.latpeedCheckoutUrl ?? null) : null,
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

/**
 * CTA href 로 넣을 최종 결제 URL 을 provider 에 맞게 생성.
 * - latpeed: 기존 외부 결제 URL + ?l=
 * - toss: 자체 결제 페이지 {basePath}/checkout?p=&l=  (구현은 P1, docs §3)
 * 반환 null 이면 CTA href 를 건드리지 않음(기존 동작).
 */
export function resolveCheckoutUrl(
  offer: Pick<Offer, "provider" | "productId" | "checkoutUrl">,
  opts: { basePath: string; leadId?: string | null },
): string | null {
  if (offer.provider === "toss") {
    const qs = new URLSearchParams({ p: offer.productId });
    if (opts.leadId) qs.set("l", opts.leadId);
    return `${opts.basePath}/checkout?${qs.toString()}`;
  }
  // latpeed (기본)
  return offer.checkoutUrl
    ? checkoutUrlWithLead(offer.checkoutUrl, opts.leadId)
    : null;
}
