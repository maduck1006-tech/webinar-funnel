import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  leads,
  messageAutomations,
  orders,
  subscriptions,
} from "@/db/schema";

export type TodayAction = { label: string; count: number; href: string };

export type Today = {
  actions: TodayAction[];
  week: {
    revenue: number;
    prevRevenue: number;
    deltaPct: number | null;
    newLeads: number;
    purchases: number;
    bookings: number;
  };
  campaigns: {
    id: string;
    name: string;
    slug: string;
    isDefault: boolean;
    status: string;
    leads: number;
    purchases: number;
    revenue: number;
  }[];
};

export async function getToday(): Promise<Today> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d14 = new Date(now.getTime() - 14 * 86_400_000);

  const [
    draftCount,
    autoOffCount,
    pastDueCount,
    week,
    prevWeek,
    weekLeads,
    weekBook,
    camps,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(and(eq(campaigns.status, "draft"), eq(campaigns.isTemplate, false)))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageAutomations)
      .where(
        and(
          eq(messageAutomations.enabled, false),
          sql`${messageAutomations.campaignId} is not null`,
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "past_due"))
      .catch(() => [{ n: 0 }]),
    db
      .select({
        rev: sql<number>`coalesce(sum(${orders.amount}),0)::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(eq(orders.status, "success"), gte(orders.paidAt, d7)))
      .catch(() => [{ rev: 0, n: 0 }]),
    db
      .select({ rev: sql<number>`coalesce(sum(${orders.amount}),0)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.status, "success"),
          gte(orders.paidAt, d14),
          lt(orders.paidAt, d7),
        ),
      )
      .catch(() => [{ rev: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(gte(leads.createdAt, d7))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          gte(leads.updatedAt, d7),
          sql`${leads.status} in ('booked','consulted')`,
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        slug: campaigns.slug,
        isDefault: campaigns.isDefault,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(eq(campaigns.isTemplate, false))
      .orderBy(desc(campaigns.isDefault), campaigns.name)
      .catch(() => []),
  ]);

  // 캠페인별 리드·구매·매출
  const perCampaign = await Promise.all(
    camps.map(async (c) => {
      const [l] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.campaignId, c.id))
        .catch(() => [{ n: 0 }]);
      const [o] = await db
        .select({
          n: sql<number>`count(*) filter (where ${orders.status}='success')::int`,
          rev: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.status}='success'),0)::int`,
        })
        .from(orders)
        .where(eq(orders.campaignId, c.id))
        .catch(() => [{ n: 0, rev: 0 }]);
      return {
        ...c,
        leads: Number(l?.n ?? 0),
        purchases: Number(o?.n ?? 0),
        revenue: Number(o?.rev ?? 0),
      };
    }),
  );

  const rev = Number(week[0]?.rev ?? 0);
  const prev = Number(prevWeek[0]?.rev ?? 0);

  const actions: TodayAction[] = [];
  const draft = Number(draftCount[0]?.n ?? 0);
  const autoOff = Number(autoOffCount[0]?.n ?? 0);
  const pastDue = Number(pastDueCount[0]?.n ?? 0);
  if (draft > 0)
    actions.push({
      label: `발행 대기 캠페인 ${draft}개`,
      count: draft,
      href: "/admin/campaigns",
    });
  if (autoOff > 0)
    actions.push({
      label: `검토 안 한 자동 메시지 ${autoOff}개`,
      count: autoOff,
      href: "/admin/automation",
    });
  if (pastDue > 0)
    actions.push({
      label: `결제 실패한 멤버십 ${pastDue}건`,
      count: pastDue,
      href: "/admin/orders",
    });

  return {
    actions,
    week: {
      revenue: rev,
      prevRevenue: prev,
      deltaPct:
        prev > 0 ? Math.round(((rev - prev) / prev) * 100) : rev > 0 ? 100 : null,
      newLeads: Number(weekLeads[0]?.n ?? 0),
      purchases: Number(week[0]?.n ?? 0),
      bookings: Number(weekBook[0]?.n ?? 0),
    },
    campaigns: perCampaign,
  };
}
