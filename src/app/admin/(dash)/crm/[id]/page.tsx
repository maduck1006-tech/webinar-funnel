import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  leads,
  messageAutomationEnrollments,
  messageAutomations,
  messageAutomationSteps,
  messageLogs,
  messageSends,
  orders,
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
import { listEntitlements } from "@/lib/entitlements";
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
  let ents: Awaited<ReturnType<typeof listEntitlements>> = [];
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
      ents = await listEntitlements(id).catch(() => []);
    }
  } catch {
    notFound();
  }
  if (!lead) notFound();

  // 자동 메시지: 이 고객의 등록 현황 + 발송 + 등록 가능한 자동화
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
        enrId: messageAutomationEnrollments.id,
        name: messageAutomations.name,
        status: messageAutomationEnrollments.status,
        enrolledAt: messageAutomationEnrollments.anchorAt,
      })
      .from(messageAutomationEnrollments)
      .innerJoin(
        messageAutomations,
        eq(messageAutomations.id, messageAutomationEnrollments.automationId),
      )
      .where(eq(messageAutomationEnrollments.leadId, id))
      .orderBy(desc(messageAutomationEnrollments.anchorAt));

    const sends = await db
      .select({
        at: messageSends.createdAt,
        status: messageSends.status,
        stepOrder: messageAutomationSteps.stepOrder,
        seqName: messageAutomations.name,
      })
      .from(messageSends)
      .innerJoin(
        messageAutomationSteps,
        eq(messageAutomationSteps.id, messageSends.stepId),
      )
      .innerJoin(
        messageAutomations,
        eq(messageAutomations.id, messageAutomationSteps.automationId),
      )
      .where(eq(messageSends.leadId, id));
    seqSends = sends.map((s) => ({
      at: s.at,
      text: `「${s.seqName}」 문자${s.stepOrder ?? "?"} — ${
        s.status === "sent"
          ? "발송"
          : s.status === "skipped"
            ? "대상 아님(건너뜀)"
            : "실패"
      }`,
    }));

    availableSeqs = await db
      .select({ id: messageAutomations.id, name: messageAutomations.name })
      .from(messageAutomations)
      .where(
        and(
          eq(messageAutomations.enabled, true),
          lead.campaignId
            ? or(
                eq(messageAutomations.campaignId, lead.campaignId),
                isNull(messageAutomations.campaignId),
              )
            : isNull(messageAutomations.campaignId),
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
            <p className="mb-2 text-sm font-bold">보유 상품 (엔타이틀먼트)</p>
            {ents.length === 0 ? (
              <p className="text-xs text-zinc-500">보유한 강의/전자책/상담권 없음</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {ents.map((e) => (
                  <li key={e.id} className="flex items-center gap-1.5">
                    <Tag tone={e.status === "active" ? "green" : "gray"}>
                      {e.status === "active"
                        ? "활성"
                        : e.status === "expired"
                          ? "만료"
                          : "회수"}
                    </Tag>
                    <span>{e.productName}</span>
                    <span className="text-zinc-400">
                      {e.expiresAt
                        ? `~${fmtDate(e.expiresAt)}`
                        : "무제한"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
