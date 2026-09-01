import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, products } from "@/db/schema";
import { resolveLeadId } from "@/lib/lead";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

/**
 * 자체 결제 페이지 (토스). 2단계 주문서:
 *  ① 연락처 입력 (퍼널 밖에서 바로 진입한 경우) → ② 결제
 * 퍼널에서 넘어오면(lead 완성) ① 을 건너뛰고 바로 ②.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; l?: string; c?: string }>;
}) {
  const { p: productId, l: lParam, c: campaignParam } = await searchParams;
  if (!productId) return notFound();

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? null;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product || !product.active || product.paymentProvider !== "toss") {
    return notFound();
  }

  // 오더 범프 상품
  let bump: { name: string; price: number; description: string } | null = null;
  if (product.bumpProductId) {
    const [bp] = await db
      .select()
      .from(products)
      .where(eq(products.id, product.bumpProductId))
      .limit(1);
    if (bp && bp.active) {
      bump = {
        name: bp.name,
        price: bp.price,
        description: product.bumpDescription || bp.description || "",
      };
    }
  }

  // lead 조회
  const leadId = await resolveLeadId(lParam);
  let lead: typeof leads.$inferSelect | null = null;
  if (leadId) {
    const [r] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    lead = r ?? null;
  }

  // 캠페인 (연락처 단계에서 lead 생성 시 사용)
  let campaignId = lead?.campaignId ?? null;
  if (!campaignId) {
    if (campaignParam) {
      const [c] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.id, campaignParam));
      campaignId = c?.id ?? null;
    }
    if (!campaignId) {
      const [d] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.isDefault, true));
      campaignId = d?.id ?? null;
    }
  }

  const hasContact = Boolean(lead?.name && lead?.email && lead?.phone);

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");

  return (
    <div className="funnel-theme min-h-dvh" style={{ background: "var(--fn-bg)" }}>
      <CheckoutClient
        clientKey={clientKey}
        product={{
          id: product.id,
          name: product.tossOrderName || product.name,
          price: product.price,
          compareAt: product.compareAtPrice,
          description: product.description ?? "",
          imageUrl: product.imageUrl ?? null,
        }}
        bump={bump}
        campaignId={campaignId}
        lead={
          lead
            ? {
                id: lead.id,
                name: lead.name ?? "",
                email: lead.email,
                phone: lead.phone ?? "",
              }
            : null
        }
        startStep={hasContact ? "pay" : "contact"}
        successUrl={`${origin}/api/toss/confirm`}
        failUrl={`${origin}/checkout/fail`}
      />
    </div>
  );
}
