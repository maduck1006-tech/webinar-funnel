import "server-only";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, messageLogs, orders } from "@/db/schema";

export type DashboardData = {
  connected: boolean;
  metrics: {
    newLeads7d: number;
    watchRate: number;
    purchases: number;
    revenue: number;
    bookings: number;
    consulted: number;
  };
  funnel: { label: string; value: number }[];
  feed: { at: Date; text: string }[];
};

const EMPTY: DashboardData = {
  connected: false,
  metrics: {
    newLeads7d: 0,
    watchRate: 0,
    purchases: 0,
    revenue: 0,
    bookings: 0,
    consulted: 0,
  },
  funnel: [
    { label: "신청", value: 0 },
    { label: "시청 시작", value: 0 },
    { label: "저가 구매", value: 0 },
    { label: "상담 예약", value: 0 },
    { label: "상담 완료", value: 0 },
  ],
  feed: [],
};

export async function getDashboard(
  campaignId?: string,
): Promise<DashboardData> {
  const leadWhere = campaignId ? eq(leads.campaignId, campaignId) : undefined;
  const orderWhere = campaignId ? eq(orders.campaignId, campaignId) : undefined;
  const msgWhere: SQL | undefined = campaignId
    ? sql`${messageLogs.leadId} in (select id from ${leads} where ${leads.campaignId} = ${campaignId})`
    : undefined;

  try {
    const [l] = await db
      .select({
        total: sql<number>`count(*)`,
        new7d: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '7 days')`,
        watched: sql<number>`count(*) filter (where ${leads.firstWatchedAt} is not null)`,
        purchased: sql<number>`count(*) filter (where ${leads.status} in ('purchased','booked','consulted'))`,
        booked: sql<number>`count(*) filter (where ${leads.status} in ('booked','consulted'))`,
        consulted: sql<number>`count(*) filter (where ${leads.status} = 'consulted')`,
      })
      .from(leads)
      .where(leadWhere);

    const [o] = await db
      .select({
        n: sql<number>`count(*) filter (where ${orders.status} = 'success')`,
        revenue: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.status} = 'success'), 0)`,
      })
      .from(orders)
      .where(orderWhere);

    const recentLeads = await db
      .select({ at: leads.createdAt, phone: leads.phone })
      .from(leads)
      .where(leadWhere)
      .orderBy(desc(leads.createdAt))
      .limit(8);
    const recentOrders = await db
      .select({ at: orders.createdAt, amount: orders.amount, status: orders.status })
      .from(orders)
      .where(orderWhere)
      .orderBy(desc(orders.createdAt))
      .limit(8);
    const recentMsgs = await db
      .select({ at: messageLogs.createdAt, trigger: messageLogs.trigger })
      .from(messageLogs)
      .where(msgWhere)
      .orderBy(desc(messageLogs.createdAt))
      .limit(8);

    const mask = (p: string) => p.replace(/(\d{3})\d+(\d{2})/, "$1****$2");
    const feed = [
      ...recentLeads.map((r) => ({ at: r.at, text: `신규 신청 — ${mask(r.phone)}` })),
      ...recentOrders.map((r) => ({
        at: r.at,
        text: `${r.status === "success" ? "결제 완료" : "결제 취소"} — ${r.amount.toLocaleString()}원`,
      })),
      ...recentMsgs.map((r) => ({ at: r.at, text: `메시지 발송 — ${r.trigger}` })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 12);

    const total = Number(l.total);
    return {
      connected: true,
      metrics: {
        newLeads7d: Number(l.new7d),
        watchRate: total ? Math.round((Number(l.watched) / total) * 100) : 0,
        purchases: Number(o.n),
        revenue: Number(o.revenue),
        bookings: Number(l.booked),
        consulted: Number(l.consulted),
      },
      funnel: [
        { label: "신청", value: total },
        { label: "시청 시작", value: Number(l.watched) },
        { label: "저가 구매", value: Number(l.purchased) },
        { label: "상담 예약", value: Number(l.booked) },
        { label: "상담 완료", value: Number(l.consulted) },
      ],
      feed,
    };
  } catch {
    return EMPTY;
  }
}
