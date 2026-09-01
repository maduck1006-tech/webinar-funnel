import "server-only";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { orders, pendingOrders } from "@/db/schema";
import { enrollLead } from "@/lib/messaging";

/**
 * 결제창까지 갔다가 이탈한 리드를 cart_abandon 자동화에 등록.
 * - pending_orders.status='ready' (승인 안 됨) 이고 생성 30분~24시간 전
 * - 그 리드에게 성공 주문이 하나도 없음
 * 크론(15분 간격)에서 호출. enrollLead 는 (automation,lead) 유니크라 재실행 안전.
 * (docs/multi-product-funnel-plan.md 보완 2/5)
 */
export async function enrollAbandonedCarts(now = new Date()): Promise<number> {
  const rows = await db
    .select({
      leadId: pendingOrders.leadId,
      campaignId: pendingOrders.campaignId,
      createdAt: pendingOrders.createdAt,
    })
    .from(pendingOrders)
    .where(
      and(
        eq(pendingOrders.status, "ready"),
        isNotNull(pendingOrders.leadId),
        lt(pendingOrders.createdAt, new Date(now.getTime() - 30 * 60_000)),
        gt(pendingOrders.createdAt, new Date(now.getTime() - 24 * 3600_000)),
      ),
    )
    .catch(() => []);

  let enrolled = 0;
  for (const r of rows) {
    if (!r.leadId) continue;
    const [paid] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.leadId, r.leadId), eq(orders.status, "success")))
      .limit(1);
    if (paid) continue;
    try {
      await enrollLead(r.leadId, "cart_abandon", r.campaignId ?? null, r.createdAt);
      enrolled++;
    } catch {
      /* 한 건 실패가 나머지를 막지 않음 */
    }
  }
  return enrolled;
}
