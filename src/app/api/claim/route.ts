import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, products } from "@/db/schema";
import { grantEntitlement } from "@/lib/entitlements";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";

/**
 * 무료 상품(price_mode='free') 수령 — 결제 없이 즉시 엔타이틀먼트 부여.
 * GET /api/claim?p=<productId>&l=<leadId>
 * (docs/multi-product-funnel-plan.md P1)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("p") ?? "";
  const leadId = url.searchParams.get("l") ?? "";
  if (!productId || !leadId) {
    return NextResponse.redirect(new URL("/", url), { status: 302 });
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));

  if (!product || !lead) {
    return NextResponse.redirect(new URL("/", url), { status: 302 });
  }
  // 안전장치: 유료 상품은 이 경로로 부여하지 않음(체크아웃 우회 방지)
  if (product.priceMode !== "free") {
    return NextResponse.redirect(new URL("/", url), { status: 302 });
  }

  try {
    await grantEntitlement({ leadId, productId, product });
  } catch (e) {
    reportError("claim.grant", e, { productId, leadId });
  }

  let basePath = "";
  if (lead.campaignId) {
    const [c] = await db
      .select({ slug: campaigns.slug, isDefault: campaigns.isDefault })
      .from(campaigns)
      .where(eq(campaigns.id, lead.campaignId));
    if (c && !c.isDefault) basePath = `/${c.slug}`;
  }
  const dest = new URL(`${basePath}/download`, url);
  dest.searchParams.set("l", leadId);
  dest.searchParams.set("p", productId);
  return NextResponse.redirect(dest, { status: 302 });
}
