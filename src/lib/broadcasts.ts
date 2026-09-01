import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  broadcastSends,
  broadcasts,
  entitlements,
  leads,
  orders,
} from "@/db/schema";
import { buildMessageVars, fillTemplate } from "@/lib/messaging";
import { sendSms } from "@/lib/solapi";

export type Segment = {
  campaignId?: string | null;
  watched?: "yes" | "no";
  purchased?: "yes" | "no";
  booked?: "yes" | "no";
  /** 이 상품 구매자 (productExclude 면 미구매자) */
  productId?: string;
  productExclude?: boolean;
  signupFrom?: string;
  signupTo?: string;
};

/** 세그먼트 → 대상 leadId 목록 */
export async function resolveSegment(seg: Segment): Promise<string[]> {
  const conds = [];
  if (seg.campaignId) conds.push(eq(leads.campaignId, seg.campaignId));
  if (seg.watched === "yes") conds.push(isNotNull(leads.firstWatchedAt));
  if (seg.watched === "no") conds.push(sql`${leads.firstWatchedAt} is null`);
  if (seg.booked === "yes")
    conds.push(inArray(leads.status, ["booked", "consulted"]));
  if (seg.booked === "no")
    conds.push(
      sql`${leads.status} not in ('booked','consulted')`,
    );
  if (seg.signupFrom) conds.push(gte(leads.createdAt, new Date(seg.signupFrom)));
  if (seg.signupTo) conds.push(lte(leads.createdAt, new Date(seg.signupTo)));

  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(conds.length ? and(...conds) : undefined);
  let ids = new Set(rows.map((r) => r.id));

  // 구매 여부 (주문 기준)
  if (seg.purchased) {
    const paid = await db
      .select({ leadId: orders.leadId })
      .from(orders)
      .where(eq(orders.status, "success"));
    const paidSet = new Set(paid.map((p) => p.leadId).filter(Boolean) as string[]);
    ids = new Set(
      [...ids].filter((id) =>
        seg.purchased === "yes" ? paidSet.has(id) : !paidSet.has(id),
      ),
    );
  }

  // 특정 상품 구매/미구매 (엔타이틀먼트 기준)
  if (seg.productId) {
    const ent = await db
      .select({ leadId: entitlements.leadId })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.productId, seg.productId),
          eq(entitlements.status, "active"),
        ),
      );
    const entSet = new Set(ent.map((e) => e.leadId));
    ids = new Set(
      [...ids].filter((id) =>
        seg.productExclude ? !entSet.has(id) : entSet.has(id),
      ),
    );
  }

  return [...ids];
}

export async function countSegment(seg: Segment): Promise<number> {
  return (await resolveSegment(seg)).length;
}

/** 브로드캐스트 실행. 이미 보낸 리드는 건너뜀(broadcast_sends unique). */
export async function runBroadcast(broadcastId: string): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const [b] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, broadcastId));
  if (!b || b.status === "sent") return { sent: 0, failed: 0, skipped: 0 };

  await db
    .update(broadcasts)
    .set({ status: "sending" })
    .where(eq(broadcasts.id, broadcastId));

  const leadIds = await resolveSegment((b.segment ?? {}) as Segment);
  const targets = leadIds.length
    ? await db
        .select({
          id: leads.id,
          phone: leads.phone,
          campaignId: leads.campaignId,
        })
        .from(leads)
        .where(inArray(leads.id, leadIds))
    : [];

  const doneRows = await db
    .select({ leadId: broadcastSends.leadId })
    .from(broadcastSends)
    .where(eq(broadcastSends.broadcastId, broadcastId));
  const done = new Set(doneRows.map((d) => d.leadId));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of targets) {
    if (done.has(t.id)) {
      skipped++;
      continue;
    }
    if (!t.phone) {
      failed++;
      continue;
    }
    try {
      const vars = await buildMessageVars(t.campaignId ?? null, t.id);
      await sendSms(t.phone, fillTemplate(b.body, vars));
      await db
        .insert(broadcastSends)
        .values({ broadcastId, leadId: t.id, status: "sent" })
        .onConflictDoNothing();
      sent++;
    } catch (e) {
      await db
        .insert(broadcastSends)
        .values({
          broadcastId,
          leadId: t.id,
          status: "failed",
          error: String(e),
        })
        .onConflictDoNothing();
      failed++;
    }
  }

  await db
    .update(broadcasts)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentCount: sql`${broadcasts.sentCount} + ${sent}`,
      failedCount: sql`${broadcasts.failedCount} + ${failed}`,
    })
    .where(eq(broadcasts.id, broadcastId));

  return { sent, failed, skipped };
}

/** 예약 시각 도래한 브로드캐스트 발송 (크론) */
export async function runDueBroadcasts(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: broadcasts.id })
    .from(broadcasts)
    .where(
      and(
        eq(broadcasts.status, "scheduled"),
        isNotNull(broadcasts.scheduledAt),
        lte(broadcasts.scheduledAt, now),
      ),
    )
    .catch(() => []);
  let n = 0;
  for (const b of due) {
    await runBroadcast(b.id).catch(() => {});
    n++;
  }
  return n;
}
