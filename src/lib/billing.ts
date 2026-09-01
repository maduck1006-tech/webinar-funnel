import "server-only";
import { and, eq, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, subscriptions } from "@/db/schema";
import { chargeBillingKey, generateTossOrderId } from "@/lib/toss";
import { enrollLead } from "@/lib/messaging";
import { reportError } from "@/lib/report";

const MAX_RETRIES = 3;

/**
 * 도래한 멤버십 정기결제 청구. 크론(reminders 경유 15분 / billing 일1회)에서 호출.
 * 재실행 안전 — 성공 시 currentPeriodEnd 가 미래로 이동해 다음 실행에서 제외됨.
 * (docs/toss-payments-plan.md §11 · 보완 5/5)
 */
export async function runDueBilling(now = new Date()): Promise<{
  due: number;
  charged: number;
  failed: number;
}> {
  const due = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "past_due"),
        ),
        lte(subscriptions.currentPeriodEnd, now),
      ),
    )
    .catch(() => []);

  let charged = 0;
  let failed = 0;

  for (const sub of due) {
    const orderId = generateTossOrderId();
    try {
      await chargeBillingKey({
        billingKey: sub.billingKey,
        customerKey: sub.customerKey,
        amount: sub.amount,
        orderId,
        orderName: "멤버십 정기결제",
      });
      const nextEnd = new Date(sub.currentPeriodEnd);
      nextEnd.setMonth(nextEnd.getMonth() + 1);
      await db
        .update(subscriptions)
        .set({ status: "active", currentPeriodEnd: nextEnd, retryCount: 0 })
        .where(eq(subscriptions.id, sub.id));
      await db.insert(orders).values({
        campaignId: sub.campaignId,
        leadId: sub.leadId,
        productId: sub.productId,
        provider: "toss",
        tossPaymentKey: orderId,
        subscriptionId: sub.id,
        orderRole: "subscription",
        amount: sub.amount,
        status: "success",
        method: "billing",
        paidAt: new Date(),
      });
      charged++;
    } catch (e) {
      failed++;
      const retry = (sub.retryCount ?? 0) + 1;
      const dunned = retry >= MAX_RETRIES;
      await db
        .update(subscriptions)
        .set({ retryCount: retry, status: dunned ? "past_due" : sub.status })
        .where(eq(subscriptions.id, sub.id));
      // dunning 안내 문자 (전역 automation 없으면 no-op)
      await enrollLead(sub.leadId, "manual", sub.campaignId ?? null).catch(
        () => {},
      );
      reportError("billing.charge", e, { subscriptionId: sub.id, retry });
    }
  }

  return { due: due.length, charged, failed };
}
