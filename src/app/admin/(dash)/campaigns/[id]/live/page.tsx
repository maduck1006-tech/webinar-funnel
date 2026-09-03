import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  eventNotices,
  eventRegistrations,
  events,
} from "@/db/schema";
import { Card, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { CampaignTabs } from "../CampaignTabs";
import { LiveNoticeForm, type EventOpt } from "./LiveNoticeForm";

export const dynamic = "force-dynamic";

const KST = (d: Date) =>
  d.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function LiveNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) notFound();

  const rows = await db
    .select({
      id: events.id,
      startsAt: events.startsAt,
      status: events.status,
      liveUrl: events.externalLiveUrl,
      registered: sql<number>`count(${eventRegistrations.id})::int`,
      notified: sql<number>`count(${eventRegistrations.notifiedAt})::int`,
      attended: sql<number>`count(${eventRegistrations.attendedAt})::int`,
      rsvp: sql<number>`count(${eventRegistrations.rsvpAt})::int`,
    })
    .from(events)
    .leftJoin(
      eventRegistrations,
      eq(eventRegistrations.eventId, events.id),
    )
    .where(eq(events.campaignId, id))
    .groupBy(events.id)
    .orderBy(asc(events.startsAt));

  const opts: EventOpt[] = rows.map((r) => ({
    id: r.id,
    label: KST(r.startsAt),
    liveUrl: r.liveUrl ?? "",
    registered: r.registered,
    notified: r.notified,
    attended: r.attended,
    rsvp: r.rsvp,
  }));

  const history = await db
    .select()
    .from(eventNotices)
    .innerJoin(events, eq(events.id, eventNotices.eventId))
    .where(eq(events.campaignId, id))
    .orderBy(desc(eventNotices.createdAt))
    .limit(8);

  const siteOrigin = (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://class.launchscale.kr"
  ).trim();

  return (
    <>
      <PageHeader
        title="이번 회차 채우기"
        desc="라이브는 한 번 알려서 오지 않습니다. 자리잡기 → 곧시작 → LIVE → 놓친분 순서로 밀어야 참석률이 오릅니다."
      />
      <CampaignTabs id={id} slug={c.slug} live />

      {opts.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-zinc-400">
            아직 라이브 회차가 없어요.{" "}
            <Link
              href={`/admin/campaigns/${id}/settings`}
              className="text-blue-600 underline"
            >
              캠페인 설정
            </Link>
            에서 회차를 먼저 만들어주세요.
          </p>
        </Card>
      ) : (
        <LiveNoticeForm
          campaignId={id}
          events={opts}
          siteOrigin={siteOrigin}
        />
      )}

      {history.length > 0 && (
        <Card className="mt-6">
          <p className="mb-3 text-sm font-bold">최근 발송</p>
          <ul className="divide-y text-sm">
            {history.map((h) => (
              <li
                key={h.event_notices.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span className="text-zinc-400">
                  {fmtDate(h.event_notices.createdAt)}
                </span>
                <Tag tone={h.event_notices.kind === "rsvp" ? "blue" : "green"}>
                  {h.event_notices.kind === "rsvp" ? "참석 확인" : "강의 안내"}
                </Tag>
                <span className="font-medium text-zinc-800">
                  {h.event_notices.sentCount}명 발송
                </span>
                {h.event_notices.dryRun && <Tag tone="gray">검증만</Tag>}
                {h.event_notices.memo && (
                  <span className="text-zinc-500">{h.event_notices.memo}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
