"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, products } from "@/db/schema";

function parse(fd: FormData) {
  const num = (k: string) => {
    const v = fd.get(k);
    return v ? Number(String(v).replace(/[^\d]/g, "")) : null;
  };
  const date = (k: string) => {
    const v = fd.get(k);
    return v ? new Date(String(v)) : null;
  };
  const uuidOrNull = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  return {
    name: String(fd.get("name") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim() || null,
    imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
    price: num("price") ?? 0,
    compareAtPrice: num("compareAtPrice"),
    showFrom: date("showFrom"),
    showUntil: date("showUntil"),
    // 결제는 전부 자체 토스 결제
    paymentProvider: "toss" as const,
    tossOrderName: String(fd.get("tossOrderName") ?? "").trim() || null,
    placement: String(fd.get("placement") ?? "both"),
    // 상품 타입 / 전달 (docs/multi-product-funnel-plan.md §4-2)
    type: String(fd.get("type") ?? "workbook"),
    // type=membership 이면 정기결제(빌링) 경로. kind 는 결제 방식 스위치
    kind:
      String(fd.get("type")) === "membership" ? "membership" : "one_time",
    membershipFreeMonths:
      String(fd.get("type")) === "membership"
        ? num("membershipFreeMonths") ?? 1
        : 0,
    priceMode: String(fd.get("priceMode") ?? "paid"),
    accessDays: num("accessDays"),
    delivery: (() => {
      const assetUrl = String(fd.get("deliveryAssetUrl") ?? "").trim();
      return assetUrl ? { assetUrl } : null;
    })(),
    // 클릭퍼널스 확장 (토스 상품에서만 의미)
    bumpProductId: uuidOrNull("bumpProductId"),
    bumpDescription: String(fd.get("bumpDescription") ?? "").trim() || null,
    upsellProductId: uuidOrNull("upsellProductId"),
    downsellProductId: uuidOrNull("downsellProductId"),
    nextOfferId: uuidOrNull("nextOfferId"),
    bundleProductIds: (() => {
      const ids = fd.getAll("bundleProductIds").map(String).filter(Boolean);
      return ids.length ? ids : null;
    })(),
    active: fd.get("active") === "on",
  };
}

export async function saveProduct(fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const data = parse(fd);
  if (!data.name || !data.price) return;
  if (id) {
    await db.update(products).set(data).where(eq(products.id, id));
  } else {
    await db.insert(products).values(data);
  }
  revalidatePath("/admin/products");
}

/**
 * 위저드(한 질문씩)로 새 상품 생성.
 * campaignId 가 오면 생성 직후 그 캠페인에 연결하고 returnTo(체크리스트 등)로 복귀.
 */
export async function createProductWizard(fd: FormData) {
  const num = (k: string) => {
    const v = fd.get(k);
    const n = v ? Number(String(v).replace(/[^\d]/g, "")) : 0;
    return Number.isFinite(n) ? n : 0;
  };
  const type = String(fd.get("type") ?? "workbook");
  const isMembership = type === "membership";
  const priceMode = String(fd.get("priceMode") ?? "paid");
  const assetUrl = String(fd.get("deliveryAssetUrl") ?? "").trim();

  const name = String(fd.get("name") ?? "").trim();
  if (!name) return;

  const [prod] = await db
    .insert(products)
    .values({
      name,
      description: String(fd.get("description") ?? "").trim() || null,
      imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
      price: priceMode === "free" ? 0 : num("price"),
      compareAtPrice: num("compareAtPrice") || null,
      type,
      kind: isMembership ? "membership" : "one_time",
      priceMode,
      membershipFreeMonths: isMembership ? num("membershipFreeMonths") || 1 : 0,
      accessDays: num("accessDays") || null,
      delivery: assetUrl ? { assetUrl } : null,
      paymentProvider: "toss",
      placement: "both",
      active: true,
    })
    .returning({ id: products.id });

  const campaignId = String(fd.get("campaignId") ?? "").trim();
  const connect = fd.get("connectCampaign") === "1";
  if (campaignId && connect) {
    await db
      .insert(campaignProducts)
      .values({
        campaignId,
        productId: prod.id,
        placement: String(fd.get("placement") ?? "both"),
      })
      .onConflictDoNothing();
    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath(`/admin/campaigns/${campaignId}/settings`);
  }
  revalidatePath("/admin/products");

  const returnTo = String(fd.get("returnTo") ?? "").trim();
  redirect(returnTo && returnTo.startsWith("/") ? returnTo : "/admin/products");
}

/** 이미 있는 상품을 캠페인에 연결 (체크리스트 인라인용) */
export async function connectExistingProduct(fd: FormData) {
  const campaignId = String(fd.get("campaignId") ?? "").trim();
  const productId = String(fd.get("productId") ?? "").trim();
  if (!campaignId || !productId) return;
  await db
    .insert(campaignProducts)
    .values({ campaignId, productId, placement: String(fd.get("placement") ?? "both") })
    .onConflictDoNothing();
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath(`/admin/campaigns/${campaignId}/settings`);
  revalidatePath("/admin/products");
}

export async function toggleProduct(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db.update(products).set({ active: next }).where(eq(products.id, id));
  revalidatePath("/admin/products");
}
