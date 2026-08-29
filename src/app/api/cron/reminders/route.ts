import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, messageLogs, orders } from "@/db/schema";
import { sendSms } from "@/lib/solapi";
import { renderCampaignMessage, resolveTrigger } from "@/lib/campaign-messages";

export const runtime = "nodejs";

type Trigger =
  | "reminder_24h"
  | "reminder_12h_left"
  | "reminder_1h_left"
  | "pre_payment_nudge";

const FALLBACK_NUDGE_H = Number(process.env.PRE_PAYMENT_NUDGE_HOURS ?? 0.5);

/** DB 입력 후 경과 시간(h) → 그 시점까지 도달한 "가장 최근" 리마인더 (놓친 창 방지) */
function dueReminder(ageHours: number): Trigger | null {
  if (ageHours >= 47) return "reminder_1h_left";
  if (ageHours >= 36) return "reminder_12h_left";
  if (ageHours >= 24) return "reminder_24h";
  return null;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 트리거 설정 캐시 (campaignId|trigger)
  const triggerCache = new Map<string, Awaited<ReturnType<typeof resolveTrigger>>>();
  const getTrigger = async (campaignId: string | null, t: Trigger) => {
    const key = `${campaignId ?? "-"}|${t}`;
    let v = triggerCache.get(key);
    if (!v) {
      v = await resolveTrigger(campaignId, t);
      triggerCache.set(key, v);
    }
    return v;
  };

  // 1) 시청 기한 만료 처리
  await db
    .update(leads)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        lt(leads.vodExpiresAt, now),
        isNull(leads.firstWatchedAt),
        eq(leads.status, "applied"),
      ),
    );
  await db
    .update(leads)
    .set({ status: "watched", updatedAt: now })
    .where(and(lt(leads.vodExpiresAt, now), eq(leads.status, "watching")));

  const sent: Record<string, number> = {};

  const send = async (
    leadId: string,
    campaignId: string | null,
    phone: string,
    trigger: Trigger,
  ) => {
    const dup = await db
      .select({ id: messageLogs.id })
      .from(messageLogs)
      .where(
        and(eq(messageLogs.leadId, leadId), eq(messageLogs.trigger, trigger)),
      )
      .limit(1);
    if (dup.length) return;

    const [log] = await db
      .insert(messageLogs)
      .values({ leadId, trigger })
      .returning({ id: messageLogs.id });
    try {
      const text = await renderCampaignMessage(campaignId, trigger, { leadId });
      await sendSms(phone, text);
      await db
        .update(messageLogs)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(messageLogs.id, log.id));
      sent[trigger] = (sent[trigger] ?? 0) + 1;
    } catch (e) {
      await db
        .update(messageLogs)
        .set({ status: "failed", error: String(e) })
        .where(eq(messageLogs.id, log.id));
    }
  };

  // 2) 마감 리마인더 — 시청 여부와 무관. 시청 기한(48h) 안에 있고 아직 미구매인 리드 전부.
  const reminderTargets = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      phone: leads.phone,
      ageHours: sql<number>`extract(epoch from (now() - ${leads.createdAt})) / 3600`,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.status, ["applied", "watching"]),
        sql`${leads.vodExpiresAt} > now()`,
      ),
    );

  for (const c of reminderTargets) {
    const trigger = dueReminder(Number(c.ageHours));
    if (!trigger) continue;
    const cfg = await getTrigger(c.campaignId, trigger);
    if (cfg.enabled) await send(c.id, c.campaignId, c.phone, trigger);
  }

  // 3) 결제 직전 유도 — 시청 시작, 미결제, firstWatchedAt + offset 경과, 시청 기한 내
  const paidLeadIds = db
    .select({ leadId: orders.leadId })
    .from(orders)
    .where(eq(orders.status, "success"));

  const watchers = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      phone: leads.phone,
      watchedAgeH: sql<number>`extract(epoch from (now() - ${leads.firstWatchedAt})) / 3600`,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.status, ["watching", "watched"]),
        sql`${leads.vodExpiresAt} > now()`,
        not(inArray(leads.id, paidLeadIds)),
      ),
    );

  for (const w of watchers) {
    const cfg = await getTrigger(w.campaignId, "pre_payment_nudge");
    if (!cfg.enabled) continue;
    const offset = cfg.offsetHours ?? FALLBACK_NUDGE_H;
    if (Number(w.watchedAgeH) < offset) continue;
    await send(w.id, w.campaignId, w.phone, "pre_payment_nudge");
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), sent });
}
