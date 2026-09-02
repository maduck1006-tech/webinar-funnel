import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  affiliateReferrals,
  affiliates,
  leads,
  orders,
} from "@/db/schema";

/** ?ref=CODE 로 들어온 리드를 어필리에이트에 연결 (first-touch, 리드당 1개) */
export async function linkReferral(
  leadId: string,
  code: string | undefined | null,
): Promise<void> {
  if (!code) return;
  const norm = code.trim().toLowerCase();
  const [aff] = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(and(eq(affiliates.code, norm), eq(affiliates.status, "active")));
  if (!aff) return;
  await db
    .insert(affiliateReferrals)
    .values({ affiliateId: aff.id, leadId })
    .onConflictDoNothing();
}

/** 결제 성공 시 커미션 기록 (리드에 어필리에이트 연결돼 있으면). 재실행 안전. */
export async function recordCommission(opts: {
  orderId: string;
  leadId: string;
  amount: number;
}): Promise<void> {
  const [ref] = await db
    .select({
      affiliateId: affiliateReferrals.affiliateId,
      pct: affiliates.commissionPct,
    })
    .from(affiliateReferrals)
    .innerJoin(affiliates, eq(affiliates.id, affiliateReferrals.affiliateId))
    .where(eq(affiliateReferrals.leadId, opts.leadId));
  if (!ref) return;

  const commission = Math.round((opts.amount * ref.pct) / 100);
  await db
    .update(orders)
    .set({ affiliateId: ref.affiliateId, commission })
    .where(eq(orders.id, opts.orderId));
}

/** 관리자 목록: 어필리에이트별 추천 수 · 매출 · 커미션 */
export async function listAffiliatesWithStats() {
  const list = await db
    .select()
    .from(affiliates)
    .orderBy(desc(affiliates.createdAt));

  return Promise.all(
    list.map(async (a) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(affiliateReferrals)
        .where(eq(affiliateReferrals.affiliateId, a.id));
      const [o] = await db
        .select({
          sales: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.status}='success'),0)::int`,
          commission: sql<number>`coalesce(sum(${orders.commission}) filter (where ${orders.status}='success'),0)::int`,
          unpaid: sql<number>`coalesce(sum(${orders.commission}) filter (where ${orders.status}='success' and ${orders.commissionPaid}=false),0)::int`,
          orderCount: sql<number>`count(*) filter (where ${orders.status}='success')::int`,
        })
        .from(orders)
        .where(eq(orders.affiliateId, a.id));
      return {
        ...a,
        referrals: Number(r?.n ?? 0),
        sales: Number(o?.sales ?? 0),
        commission: Number(o?.commission ?? 0),
        unpaid: Number(o?.unpaid ?? 0),
        orderCount: Number(o?.orderCount ?? 0),
      };
    }),
  );
}

/** 한 어필리에이트의 추천 리드 + 주문 */
export async function getAffiliateDetail(id: string) {
  const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, id));
  if (!aff) return null;
  const refs = await db
    .select({
      leadId: affiliateReferrals.leadId,
      name: leads.name,
      phone: leads.phone,
      firstSeenAt: affiliateReferrals.firstSeenAt,
      status: leads.status,
    })
    .from(affiliateReferrals)
    .innerJoin(leads, eq(leads.id, affiliateReferrals.leadId))
    .where(eq(affiliateReferrals.affiliateId, id))
    .orderBy(desc(affiliateReferrals.firstSeenAt));
  const ords = await db
    .select()
    .from(orders)
    .where(and(eq(orders.affiliateId, id), eq(orders.status, "success")))
    .orderBy(desc(orders.paidAt));
  return { aff, refs, orders: ords };
}
