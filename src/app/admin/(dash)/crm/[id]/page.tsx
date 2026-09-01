import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  leads,
  messageLogs,
  messageSequences,
  orders,
  sequenceEnrollments,
  sequenceSends,
  sequenceSteps,
} from "@/db/schema";
import { and, isNull, or } from "drizzle-orm";
import {
  Card,
  PageHeader,
  STATUS_LABEL,
  Tag,
  fmtDate,
  statusTone,
  won,
} from "@/components/admin-ui";
import { ManualActions } from "./ManualActions";

export const dynamic = "force-dynamic";

export default async function CrmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lead: typeof leads.$inferSelect | undefined;
  let campaignName: string | null = null;
  let msgs: (typeof messageLogs.$inferSelect)[] = [];
  let ords: (typeof orders.$inferSelect)[] = [];
  try {
    [lead] = await db.select().from(leads).where(eq(leads.id, id));
    if (lead) {
      if (lead.campaignId) {
        const [c] = await db
          .select({ name: campaigns.name })
          .from(campaigns)
          .where(eq(campaigns.id, lead.campaignId));
        campaignName = c?.name ?? null;
      }
      msgs = await db
        .select()
        .from(messageLogs)
        .where(eq(messageLogs.leadId, id))
        .orderBy(desc(messageLogs.createdAt));
      ords = await db
        .select()
        .from(orders)
        .where(eq(orders.leadId, id))
        .orderBy(desc(orders.createdAt));
    }
  } catch {
    notFound();
  }
  if (!lead) notFound();

  // 문자 시퀀스: 이 고객의 등록 현황 + 발송 + 등록 가능한 시퀀스
  type EnrRow = {
    enrId: string;
    name: string;
    status: string;
    enrolledAt: Date;
  };
  let enrollments: EnrRow[] = [];
  let seqSends: { at: Date; text: string }[] = [];
  let availableSeqs: { id: string; name: string }[] = [];
  try {
    enrollments = await db
      .select({
        enrId: sequenceEnrollments.id,
        name: messageSequences.name,
        status: sequenceEnrollments.status,
        enrolledAt: sequenceEnrollments.enrolledAt,
      })
      .from(sequenceEnrollments)
      .innerJoin(
        messageSequences,
        eq(messageSequences.id, sequenceEnrollments.sequenceId),
      )
      .where(eq(sequenceEnrollments.leadId, id))
      .orderBy(desc(sequenceEnrollments.enrolledAt));

    if (enrollments.length > 0) {
      const enrIds = enrollments.map((e) => e.enrId);
      const sends = await db
        .select({
          at: sequenceSends.createdAt,
          status: sequenceSends.status,
          stepOrder: sequenceSteps.stepOrder,
          seqName: messageSequences.name,
        })
        .from(sequenceSends)
        .innerJoin(
          sequenceEnrollments,
          eq(sequenceEnrollments.id, sequenceSends.enrollmentId),
        )
        .innerJoin(
          messageSequences,
          eq(messageSequences.id, sequenceEnrollments.sequenceId),
        )
        .leftJoin(sequenceSteps, eq(sequenceSteps.id, sequenceSends.stepId))
        .where(eq(sequenceEnrollments.leadId, id));
      seqSends = sends.map((s) => ({
        at: s.at,
        text: `시퀀스 「${s.seqName}」 문자${s.stepOrder ?? "?"} — ${
          s.status === "sent"
            ? "발송"
            : s.status === "skipped"
              ? "대상 아님(건너뜀)"
              : "실패"
        }`,
      }));
    }

    availableSeqs = await db
      .select({ id: messageSequences.id, name: messageSequences.name })
      .from(messageSequences)
      .where(
        and(
          eq(messageSequences.enabled, true),
          lead.campaignId
            ? or(
                eq(messageSequences.campaignId, lead.campaignId),
                isNull(messageSequences.campaignId),
              )
            : isNull(messageSequences.campaignId),
        ),
      );
  } catch {
    /* 시퀀스 테이블 없음 등 */
  }

  const timeline = [
    { at: lead.createdAt, text: "DB 입력 (신청)" },
    ...(lead.firstWatchedAt
      ? [{ at: lead.firstWatchedAt, text: "VOD 시청 시작" }]
      : []),
    ...msgs.map((m) => ({
      at: m.sentAt ?? m.createdAt,
      text: `CRM 메시지 ${m.trigger} — ${m.status}`,
    })),
    ...ords.map((o) => ({
      at: o.paidAt ?? o.createdAt,
      text: `결제 ${o.status} — ${won(o.amount)}${o.orderRole !== "main" ? ` [${o.orderRole}]` : ""}`,
    })),
    ...seqSends,
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <PageHeader
        title="CRM 고객 상세"
        desc={
          <Link href="/admin/crm" className="text-blue-600 underline">
            ← 목록으로
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-bold">고객 정보</p>
            <p className="mt-2 text-sm">
              {lead.email} · {lead.phone}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {campaignName && <>캠페인 {campaignName} · </>}
              DB 입력 {fmtDate(lead.createdAt)} · 시청 만료{" "}
              {fmtDate(lead.vodExpiresAt)}
            </p>
            <p className="mt-2">
              <Tag tone={statusTone(lead.status)}>
                {STATUS_LABEL[lead.status]}
              </Tag>
            </p>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-bold">타임라인</p>
            <ul className="space-y-2 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {fmtDate(t.at)}
                  </span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <p className="mb-3 text-sm font-bold">수동 조치</p>
            <ManualActions
              leadId={lead.id}
              statusOptions={Object.entries(STATUS_LABEL)}
              currentStatus={lead.status}
              sequences={availableSeqs}
            />
          </Card>

          <Card>
            <p className="mb-2 text-sm font-bold">문자 시퀀스</p>
            {enrollments.length === 0 ? (
              <p className="text-xs text-zinc-500">등록된 시퀀스 없음</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {enrollments.map((e) => (
                  <li key={e.enrId} className="flex items-center gap-1.5">
                    <Tag
                      tone={
                        e.status === "active"
                          ? "green"
                          : e.status === "done"
                            ? "gray"
                            : "amber"
                      }
                    >
                      {e.status === "active"
                        ? "진행중"
                        : e.status === "done"
                          ? "완료"
                          : "중지"}
                    </Tag>
                    <span>{e.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
