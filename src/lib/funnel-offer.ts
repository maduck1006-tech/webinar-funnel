import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, products } from "@/db/schema";

export type Offer = {
  productId: string;
  name: string;
  price: number;
  compareAt: number | null;
  kind: string;
  type: string;
  priceMode: string;
  delivery: Record<string, unknown> | null;
};

/**
 * 캠페인의 현재 노출 상품 1개.
 * - campaign_products 매핑 + placement 일치 (또는 'both')
 * - products.active = true, 노출기간(showFrom/showUntil) 이내
 * placement 'sales' = 세일즈페이지 메인 상품 (docs/multi-product-funnel-plan.md §4-2)
 */
export async function getActiveOffer(
  campaignId: string,
  placement: "thankyou" | "vod_bottom" | "sales",
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
      kind: p.kind,
      type: p.type,
      priceMode: p.priceMode,
      delivery: p.delivery ?? null,
    };
  } catch {
    return null;
  }
}

export type ProductOffers = {
  bumpProductId: string | null;
  bumpDescription: string | null;
  upsellProductId: string | null;
  downsellProductId: string | null;
};

/**
 * 이 캠페인에서 이 상품 주문서에 붙는 추가 오퍼(범프/업셀/다운셀).
 * campaign_products 매핑 우선, 없으면 products 의 (deprecated) 전역값 폴백.
 * campaignId 가 없으면(퍼널 밖 직접 결제) products 전역값만.
 */
export async function getProductOffers(
  productId: string,
  campaignId: string | null,
): Promise<ProductOffers> {
  const empty: ProductOffers = {
    bumpProductId: null,
    bumpDescription: null,
    upsellProductId: null,
    downsellProductId: null,
  };
  try {
    const [prod] = await db
      .select({
        bumpProductId: products.bumpProductId,
        bumpDescription: products.bumpDescription,
        upsellProductId: products.upsellProductId,
        downsellProductId: products.downsellProductId,
      })
      .from(products)
      .where(eq(products.id, productId));
    if (!prod) return empty;

    let cp:
      | {
          bumpProductId: string | null;
          bumpDescription: string | null;
          upsellProductId: string | null;
          downsellProductId: string | null;
        }
      | undefined;
    if (campaignId) {
      [cp] = await db
        .select({
          bumpProductId: campaignProducts.bumpProductId,
          bumpDescription: campaignProducts.bumpDescription,
          upsellProductId: campaignProducts.upsellProductId,
          downsellProductId: campaignProducts.downsellProductId,
        })
        .from(campaignProducts)
        .where(
          and(
            eq(campaignProducts.campaignId, campaignId),
            eq(campaignProducts.productId, productId),
          ),
        );
    }
    return {
      bumpProductId: cp?.bumpProductId ?? prod.bumpProductId ?? null,
      bumpDescription: cp?.bumpDescription ?? prod.bumpDescription ?? null,
      upsellProductId: cp?.upsellProductId ?? prod.upsellProductId ?? null,
      downsellProductId:
        cp?.downsellProductId ?? prod.downsellProductId ?? null,
    };
  } catch {
    return empty;
  }
}

/** 결제 URL 에 lead 식별자 붙이기 */
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
 * CTA href 로 넣을 결제(또는 무료 수령) URL.
 * - 유료: {basePath}/checkout?p=<productId>&l=<leadId> (토스 결제창)
 * - 무료(price_mode='free'): {basePath}/api/claim?p=&l= (체크아웃 스킵, 즉시 엔타이틀먼트 부여)
 */
export function resolveCheckoutUrl(
  offer: Pick<Offer, "productId"> & { priceMode?: string },
  opts: { basePath: string; leadId?: string | null },
): string {
  const qs = new URLSearchParams({ p: offer.productId });
  if (opts.leadId) qs.set("l", opts.leadId);
  const path = offer.priceMode === "free" ? "/api/claim" : "/checkout";
  return `${opts.basePath}${path}?${qs.toString()}`;
}
