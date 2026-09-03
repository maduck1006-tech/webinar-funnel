import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, eventRegistrations, events, leads } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * 라이브 안내의 개인별 추적 링크.
 *   /live/{token}          → 참석으로 기록하고 라이브로 넘김
 *   /live/{token}?rsvp=1   → 참석 의사만 접수하고 확인 화면
 *
 * 토큰은 발송 시점에 신청자마다 하나씩 발급된다(= 클릭한 사람이 누군지 특정 가능).
 */
export default async function LiveEntry({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rsvp?: string }>;
}) {
  const { token } = await params;
  const { rsvp } = await searchParams;
  const isRsvp = rsvp === "1";

  const [row] = await db
    .select({
      regId: eventRegistrations.id,
      attendedAt: eventRegistrations.attendedAt,
      rsvpAt: eventRegistrations.rsvpAt,
      name: leads.name,
      liveUrl: events.externalLiveUrl,
      startsAt: events.startsAt,
      slug: campaigns.slug,
      isDefault: campaigns.isDefault,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .innerJoin(campaigns, eq(campaigns.id, events.campaignId))
    .innerJoin(leads, eq(leads.id, eventRegistrations.leadId))
    .where(eq(eventRegistrations.token, token))
    .limit(1);

  if (!row) notFound();

  const basePath = row.isDefault ? "" : `/${row.slug}`;

  // 첫 클릭만 기록 — 여러 번 눌러도 처음 시각을 유지한다
  if (isRsvp) {
    if (!row.rsvpAt) {
      await db
        .update(eventRegistrations)
        .set({ rsvpAt: new Date() })
        .where(eq(eventRegistrations.id, row.regId));
    }
  } else if (!row.attendedAt) {
    await db
      .update(eventRegistrations)
      .set({ attendedAt: new Date() })
      .where(eq(eventRegistrations.id, row.regId));
  }

  // 강의 안내: 기록만 남기고 곧바로 라이브로 넘긴다
  if (!isRsvp) redirect(row.liveUrl || `${basePath}/vod`);

  const when = row.startsAt.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="funnel-theme flex min-h-dvh items-center justify-center px-5 py-10"
      style={{ background: "var(--fn-bg)" }}
    >
      <div className="w-full max-w-[420px] text-center">
        <p className="text-4xl">🙌</p>
        <h1 className="mt-4 text-xl font-extrabold text-white">
          참석 접수됐습니다
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          {row.name ? `${row.name}님, ` : ""}
          기다리고 있을게요.
        </p>
        <p
          className="mt-5 rounded-xl px-4 py-3 text-sm font-bold text-white"
          style={{ background: "var(--fn-bg-2)" }}
        >
          {when}
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-white/40">
          시작 전에 입장 링크를 다시 보내드립니다.
          <br />이 창은 닫으셔도 됩니다.
        </p>
      </div>
    </div>
  );
}
