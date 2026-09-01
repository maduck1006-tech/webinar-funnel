import "server-only";
import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { eventRegistrations, events, leads, type Event } from "@/db/schema";
import { sendSms } from "@/lib/solapi";

/** 캠페인의 다음 예정 회차 (가장 임박한 scheduled 이벤트) */
export async function getUpcomingEvent(
  campaignId: string,
): Promise<Event | null> {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.campaignId, campaignId), eq(events.status, "scheduled")))
    .orderBy(asc(events.startsAt))
    .limit(1);
  return row ?? null;
}

/** 리드를 다음 예정 회차에 등록(재실행 안전). 등록된 이벤트 반환 */
export async function registerForEvent(
  leadId: string,
  campaignId: string,
): Promise<Event | null> {
  const event = await getUpcomingEvent(campaignId);
  if (!event) return null;
  await db
    .insert(eventRegistrations)
    .values({ eventId: event.id, leadId })
    .onConflictDoNothing();
  return event;
}

/** 리드가 등록한 (가장 최근) 회차 */
export async function getRegisteredEvent(
  leadId: string,
): Promise<Event | null> {
  const [row] = await db
    .select({ event: events })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(eq(eventRegistrations.leadId, leadId))
    .orderBy(desc(eventRegistrations.registeredAt))
    .limit(1);
  return row?.event ?? null;
}

export function replayOpensAt(event: Pick<Event, "startsAt" | "durationMin">) {
  return new Date(event.startsAt.getTime() + event.durationMin * 60_000);
}

export function replayClosesAt(
  event: Pick<Event, "startsAt" | "durationMin" | "replayWindowHours">,
) {
  return new Date(
    replayOpensAt(event).getTime() + event.replayWindowHours * 3600_000,
  );
}

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/$/, "");

function fmtKst(d: Date) {
  return d.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * 라이브 시작 전 사전 리마인더(24h / 1h 전). 자동 메시지 엔진은 항상 anchor 이후(양수 지연)만
 * 다루므로, "이벤트 전" 리마인더는 여기서 별도 처리한다 — 크론(15분 간격)에서 호출.
 * (docs/multi-product-funnel-plan.md P3)
 */
export async function sendEventPreReminders(now = new Date()): Promise<{
  d1: number;
  h1: number;
}> {
  let d1 = 0;
  let h1 = 0;
  const in25h = new Date(now.getTime() + 25 * 3600_000);
  const rows = await db
    .select({
      regId: eventRegistrations.id,
      remindedD1: eventRegistrations.remindedD1,
      remindedH1: eventRegistrations.remindedH1,
      leadId: eventRegistrations.leadId,
      event: events,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(eq(events.status, "scheduled"), gt(events.startsAt, now), lte(events.startsAt, in25h)));

  for (const r of rows) {
    const [lead] = await db
      .select({ phone: leads.phone, name: leads.name })
      .from(leads)
      .where(eq(leads.id, r.leadId));
    if (!lead?.phone) continue;

    const hoursLeft = (r.event.startsAt.getTime() - now.getTime()) / 3600_000;
    const link = r.event.externalLiveUrl || `${SITE}/vod?l=${r.leadId}`;
    const when = fmtKst(r.event.startsAt);
    const name = lead.name ?? "회원";

    if (!r.remindedD1 && hoursLeft <= 24) {
      await sendSms(
        lead.phone,
        `${name}님, 내일 라이브 강의가 있어요! (${when})\n입장 링크는 시작 직전에 여기서 열립니다.\n${link}`,
      );
      await db
        .update(eventRegistrations)
        .set({ remindedD1: true })
        .where(eq(eventRegistrations.id, r.regId));
      d1++;
    }
    if (!r.remindedH1 && hoursLeft <= 1) {
      await sendSms(
        lead.phone,
        `${name}님, 1시간 뒤 라이브가 시작됩니다!\n${link}`,
        { immediate: true },
      );
      await db
        .update(eventRegistrations)
        .set({ remindedH1: true })
        .where(eq(eventRegistrations.id, r.regId));
      h1++;
    }
  }

  return { d1, h1 };
}
