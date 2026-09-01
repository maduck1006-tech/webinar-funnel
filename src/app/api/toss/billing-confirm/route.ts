import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, products } from "@/db/schema";
import { issueBillingKey } from "@/lib/toss";
import { startSubscription } from "@/lib/subscriptions";
import { enrollLead, stopAutomations } from "@/lib/messaging";
import { resolveLeadId } from "@/lib/lead";
import { reportError } from "@/lib/report";

export const runtime = "nodejs";

/**
 * 멤버십 빌링 인증 successUrl.
 * Toss 가 ?customerKey=&authKey= 를 붙여 리다이렉트 (+ 우리가 넣은 ?p=&l=)
 * (docs/toss-payments-plan.md §11 · 보완 5/5)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authKey = url.searchParams.get("authKey") ?? "";
  const customerKey = url.searchParams.get("customerKey") ?? "";
  const productId = url.searchParams.get("p") ?? "";
  const leadId =
    (await resolveLeadId(url.searchParams.get("l") ?? undefined)) ?? customerKey;

  function fail(msg: string) {
    const u = new URL("/checkout/fail", url);
    u.searchParams.set("code", "BILLING");
    u.searchParams.set("message", msg);
    return NextResponse.redirect(u, { status: 302 });
  }

  if (!authKey || !customerKey || !productId) return fail("인증 정보 누락");

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!product || product.kind !== "membership") return fail("잘못된 상품");
  if (!lead) return fail("회원 정보를 찾을 수 없습니다");

  let bk;
  try {
    bk = await issueBillingKey({ authKey, customerKey });
  } catch (e) {
    reportError("toss.billing.issue", e, { productId, leadId });
    return fail("카드 등록에 실패했습니다. 다시 시도해 주세요.");
  }

  const cardInfo =
    bk.cardCompany || bk.cardNumber
      ? `${bk.cardCompany ?? ""} ${bk.cardNumber ?? ""}`.trim()
      : null;

  try {
    await startSubscription({
      leadId,
      campaignId: lead.campaignId ?? null,
      product,
      billingKey: bk.billingKey,
      customerKey: bk.customerKey,
      cardInfo,
    });
    if (lead.status !== "member") {
      await db
        .update(leads)
        .set({ status: "member", updatedAt: new Date() })
        .where(eq(leads.id, leadId));
    }
    await enrollLead(leadId, "purchase", lead.campaignId ?? null).catch(() => {});
    await stopAutomations(leadId, "purchase").catch(() => {});
  } catch (e) {
    reportError("toss.billing.start", e, { productId, leadId });
    return fail("구독 시작 처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.");
  }

  // 이동: 캠페인 결제 후 URL 우선
  let dest = "/vod?paid=1";
  if (lead.campaignId) {
    const [c] = await db
      .select({
        slug: campaigns.slug,
        isDefault: campaigns.isDefault,
        checkoutRedirectUrl: campaigns.checkoutRedirectUrl,
      })
      .from(campaigns)
      .where(eq(campaigns.id, lead.campaignId));
    if (c) {
      const base = c.isDefault ? "" : `/${c.slug}`;
      dest = c.checkoutRedirectUrl || `${base}/vod?paid=1`;
    }
  }
  const d = new URL(dest, url);
  d.searchParams.set("l", leadId);
  return NextResponse.redirect(d, { status: 302 });
}
