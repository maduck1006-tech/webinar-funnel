import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  billingKeys,
  orders,
  subscriptions,
  type Product,
} from "@/db/schema";
import { grantEntitlement } from "@/lib/entitlements";

/** 리드에게 유효한(active + 기간 내) 멤버십이 있는지 */
export async function hasActiveSubscription(leadId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.leadId, leadId),
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/**
 * 빌링키 발급 완료 후 구독 시작.
 * - billing_keys upsert (lead 당 1개 최신)
 * - subscriptions 생성 (무료 개월 반영: currentPeriodEnd, trialEndsAt)
 * - 연결 상품 엔타이틀먼트 부여 + 최초 주문 1행 (금액 0 = 무료기간 시작)
 * (docs/toss-payments-plan.md §11 · 보완 5/5)
 */
export async function startSubscription(opts: {
  leadId: string;
  campaignId: string | null;
  product: Product;
  billingKey: string;
  customerKey: string;
  cardInfo: string | null;
}): Promise<string> {
  const { leadId, campaignId, product, billingKey, customerKey, cardInfo } = opts;
  const now = new Date();
  const freeMonths = product.membershipFreeMonths ?? 0;
  const periodEnd = addMonths(now, Math.max(1, freeMonths || 1));
  const trialEndsAt = freeMonths > 0 ? addMonths(now, freeMonths) : now;

  await db
    .insert(billingKeys)
    .values({ leadId, customerKey, billingKey, cardInfo })
    .onConflictDoUpdate({
      target: billingKeys.leadId,
      set: { customerKey, billingKey, cardInfo },
    });

  const [sub] = await db
    .insert(subscriptions)
    .values({
      campaignId,
      leadId,
      productId: product.id,
      billingKey,
      customerKey,
      cardInfo,
      status: "active",
      interval: "monthly",
      amount: product.price,
      currentPeriodEnd: periodEnd,
      trialEndsAt,
    })
    .returning({ id: subscriptions.id });

  await grantEntitlement({ leadId, productId: product.id, product });

  await db.insert(orders).values({
    campaignId,
    leadId,
    productId: product.id,
    provider: "toss",
    subscriptionId: sub.id,
    orderRole: "subscription",
    amount: freeMonths > 0 ? 0 : product.price,
    status: "success",
    method: "billing",
    paidAt: now,
  });

  return sub.id;
}
