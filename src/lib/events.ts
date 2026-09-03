import "server-only";
import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { randomBytes } from "node:crypto";
import {
  eventNotices,
  eventRegistrations,
  events,
  leads,
  type Event,
} from "@/db/schema";
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

/* ------------------------------------------------------------------ *
 * 라이브 안내 수동 발송 + 참석 추적
 *
 * 사람마다 다른 주소(/live/{token})를 보내고, 그 주소를 눌러야 참석으로
 * 기록된다. 그래서 "보낸 수"와 "실제로 들어온 수"를 나눠 볼 수 있다.
 * 지금은 문자로 나가고, 알림톡 채널이 준비되면 보내는 통로만 갈아끼운다.
 * ------------------------------------------------------------------ */

/**
 * 보내는 '시점'. 웨비나 참석률은 한 번 보내서 오르지 않고
 * 하루 전 → 1시간 전 → 시작 직전 → 시작 후(미입장자) 시퀀스로 오른다.
 *  - rsvp  : 참석 의사만 접수 (링크에 ?rsvp=1)
 *  - nudge : 아직 입장 안 한 사람에게만
 */
export type LiveNoticeKind = "rsvp" | "soon" | "start" | "nudge" | "custom";
/** 받는 사람 범위 */
export type LiveAudience = "all" | "unattended" | "rsvped";

/** 12자 URL-safe 토큰. 문자 길이를 아끼려고 UUID 대신 짧게. */
function newToken() {
  return randomBytes(9).toString("base64url");
}

/** 안내 문구 + 개인별 링크를 한 통으로 */
export function buildNoticeText(
  body: string,
  name: string | null,
  link: string | null,
  startsAt?: Date | null,
): string {
  const filled = body
    .replace(/\{이름\}/g, name ?? "회원")
    .replace(/\{일시\}/g, startsAt ? fmtKst(startsAt) : "");
  return link ? `${filled.trim()}\n\n${link}` : filled.trim();
}

export async function countRegistrations(eventId: string): Promise<number> {
  const rows = await db
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .innerJoin(leads, eq(leads.id, eventRegistrations.leadId))
    .where(eq(eventRegistrations.eventId, eventId));
  return rows.length;
}

export async function sendLiveNotice(opts: {
  eventId: string;
  kind: LiveNoticeKind;
  body: string;
  /** 입력했으면 회차의 라이브 링크도 이 값으로 갱신 */
  liveUrl?: string | null;
  memo?: string | null;
  /** 값이 있으면 이 번호 한 곳으로만 (추적 링크 없이) */
  testPhone?: string | null;
  /** 실제 발송 없이 로직만 */
  dryRun?: boolean;
  /** 받는 사람 범위. 없으면 kind 로 추론 (nudge→미입장자, 그 외→전체) */
  audience?: LiveAudience;
  /** false 면 추적 링크를 붙이지 않는다 (돌발 안내용). 기본 true */
  withLink?: boolean;
}): Promise<{ total: number; sent: number; failed: number; test: boolean }> {
  const { eventId, kind, body, memo, testPhone, dryRun } = opts;
  const liveUrl = opts.liveUrl?.trim() || null;
  const isRsvp = kind === "rsvp";
  const withLink = opts.withLink !== false;
  const audience: LiveAudience =
    opts.audience ?? (kind === "nudge" ? "unattended" : "all");

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error("회차를 찾을 수 없습니다");

  if (liveUrl && liveUrl !== event.externalLiveUrl) {
    await db
      .update(events)
      .set({ externalLiveUrl: liveUrl })
      .where(eq(events.id, eventId));
  }

  // 테스트 발송 — 명단을 건드리지 않고 문구만 확인한다
  if (testPhone) {
    const sample = buildNoticeText(
      body,
      "홍길동",
      withLink ? `${SITE}/live/sample${isRsvp ? "?rsvp=1" : ""}` : null,
      event.startsAt,
    );
    if (!dryRun) await sendSms(testPhone, sample, { immediate: true });
    return { total: 1, sent: dryRun ? 0 : 1, failed: 0, test: true };
  }

  const rows = (
    await db
      .select({
        regId: eventRegistrations.id,
        token: eventRegistrations.token,
        attendedAt: eventRegistrations.attendedAt,
        rsvpAt: eventRegistrations.rsvpAt,
        phone: leads.phone,
        name: leads.name,
      })
      .from(eventRegistrations)
      .innerJoin(leads, eq(leads.id, eventRegistrations.leadId))
      .where(eq(eventRegistrations.eventId, eventId))
  ).filter((r) =>
    audience === "unattended"
      ? !r.attendedAt
      : audience === "rsvped"
        ? Boolean(r.rsvpAt)
        : true,
  );

  let sent = 0;
  let failed = 0;

  for (const r of rows) {
    if (!r.phone) {
      failed++;
      continue;
    }
    // 토큰은 처음 보낼 때 한 번만 발급하고 이후 재사용한다
    let token = r.token;
    if (!token) {
      token = newToken();
      await db
        .update(eventRegistrations)
        .set({ token })
        .where(eq(eventRegistrations.id, r.regId));
    }
    const link = withLink
      ? `${SITE}/live/${token}${isRsvp ? "?rsvp=1" : ""}`
      : null;
    try {
      if (!dryRun) {
        await sendSms(
          r.phone,
          buildNoticeText(body, r.name, link, event.startsAt),
          { immediate: true },
        );
        await db
          .update(eventRegistrations)
          .set({ notifiedAt: new Date() })
          .where(eq(eventRegistrations.id, r.regId));
      }
      sent++;
    } catch {
      failed++;
    }
  }

  await db.insert(eventNotices).values({
    eventId,
    kind,
    memo: memo?.trim() || null,
    body,
    liveUrl,
    sentCount: dryRun ? 0 : sent,
    failedCount: failed,
    dryRun: !!dryRun,
  });

  return { total: rows.length, sent, failed, test: false };
}
