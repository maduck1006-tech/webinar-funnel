"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";

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

export async function toggleProduct(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db.update(products).set({ active: next }).where(eq(products.id, id));
  revalidatePath("/admin/products");
}
