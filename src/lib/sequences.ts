import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  leads,
  messageSequences,
  orders,
  sequenceEnrollments,
  sequenceSends,
  sequenceSteps,
  type SequenceAudience,
  type SequenceEnrollEvent,
} from "@/db/schema";
import { buildMessageVars, fillTemplate } from "@/lib/campaign-messages";
import { sendSms } from "@/lib/solapi";

/**
 * 리드를 해당 이벤트의 시퀀스에 등록한다. (idempotent — 이미 등록돼 있으면 무시)
 * 캠페인 전용 시퀀스 + 전역 시퀀스(campaignId IS NULL) 둘 다 대상.
 */
export async function enrollLeadInSequences(
  leadId: string,
  event: SequenceEnrollEvent,
  campaignId: string | null,
): Promise<number> {
  const seqs = await db
    .select({ id: messageSequences.id })
    .from(messageSequences)
    .where(
      and(
        eq(messageSequences.enrollEvent, event),
        eq(messageSequences.enabled, true),
        campaignId
          ? or(
              eq(messageSequences.campaignId, campaignId),
              isNull(messageSequences.campaignId),
            )
          : isNull(messageSequences.campaignId),
      ),
    )
    .catch(() => []);

  if (seqs.length === 0) return 0;

  await db
    .insert(sequenceEnrollments)
    .values(seqs.map((s) => ({ sequenceId: s.id, leadId })))
    .onConflictDoNothing();

  return seqs.length;
}

/** 관리자 수동 등록 (manual 이벤트가 아닌 특정 시퀀스에 강제 등록) */
export async function enrollLeadInSequence(sequenceId: string, leadId: string) {
  await db
    .insert(sequenceEnrollments)
    .values({ sequenceId, leadId })
    .onConflictDoNothing();
}

async function audienceMatches(
  leadId: string,
  audience: SequenceAudience,
): Promise<boolean> {
  if (audience === "all") return true;

  const [lead] = await db
    .select({ status: leads.status, firstWatchedAt: leads.firstWatchedAt })
    .from(leads)
    .where(eq(leads.id, leadId));
  if (!lead) return false;

  if (audience === "not_watched") return !lead.firstWatchedAt;
  if (audience === "not_booked")
    return !["booked", "consulted"].includes(lead.status);
  if (audience === "not_purchased") {
    if (["purchased", "booked", "consulted"].includes(lead.status)) return false;
    const paid = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.leadId, leadId), eq(orders.status, "success")))
      .limit(1);
    return paid.length === 0;
  }
  return true;
}

/**
 * 발송 예정인 시퀀스 스텝을 처리한다. 크론에서 15분마다 호출.
 * - active 등록 건마다: enrolledAt + step.delayHours <= now 인 미발송 스텝을 순서대로 처리
 * - 대상 조건 불일치면 'skipped' 로 기록하고 다음 스텝으로 (건너뛰기)
 * - 마지막 스텝까지 처리되면 status='done'
 */
export async function runDueSequenceSteps(now = new Date()): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const active = await db
    .select({
      enrId: sequenceEnrollments.id,
      seqId: sequenceEnrollments.sequenceId,
      leadId: sequenceEnrollments.leadId,
      enrolledAt: sequenceEnrollments.enrolledAt,
    })
    .from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.status, "active"))
    .catch(() => []);

  let sent = 0,
    skipped = 0,
    failed = 0,
    processed = 0;

  // 시퀀스별 스텝 캐시
  const stepCache = new Map<string, (typeof sequenceSteps.$inferSelect)[]>();
  const getSteps = async (seqId: string) => {
    if (!stepCache.has(seqId)) {
      stepCache.set(
        seqId,
        await db
          .select()
          .from(sequenceSteps)
          .where(
            and(
              eq(sequenceSteps.sequenceId, seqId),
              eq(sequenceSteps.enabled, true),
            ),
          )
          .orderBy(asc(sequenceSteps.stepOrder)),
      );
    }
    return stepCache.get(seqId)!;
  };

  for (const enr of active) {
    const steps = await getSteps(enr.seqId);
    if (steps.length === 0) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "done" })
        .where(eq(sequenceEnrollments.id, enr.enrId));
      continue;
    }

    const done = await db
      .select({ stepId: sequenceSends.stepId })
      .from(sequenceSends)
      .where(eq(sequenceSends.enrollmentId, enr.enrId));
    const doneIds = new Set(done.map((d) => d.stepId));

    let campaignId: string | null = null;
    const remaining = steps.filter((s) => !doneIds.has(s.id));

    for (const step of remaining) {
      const dueAt = new Date(
        enr.enrolledAt.getTime() + step.delayHours * 3600_000,
      );
      if (dueAt > now) break; // 아직 시간 안 됨 — 이후 스텝도 미래

      processed++;
      // 대상 조건
      if (!(await audienceMatches(enr.leadId, step.audience))) {
        await db
          .insert(sequenceSends)
          .values({ enrollmentId: enr.enrId, stepId: step.id, status: "skipped" })
          .onConflictDoNothing();
        skipped++;
        continue;
      }

      // lead 연락처 + 캠페인
      const [lead] = await db
        .select({ phone: leads.phone, campaignId: leads.campaignId })
        .from(leads)
        .where(eq(leads.id, enr.leadId));
      if (!lead?.phone) {
        await db
          .insert(sequenceSends)
          .values({
            enrollmentId: enr.enrId,
            stepId: step.id,
            status: "failed",
            error: "연락처 없음",
          })
          .onConflictDoNothing();
        failed++;
        continue;
      }
      campaignId = lead.campaignId;

      try {
        const vars = await buildMessageVars(campaignId, enr.leadId);
        const body = fillTemplate(step.template, vars);
        await sendSms(lead.phone, body);
        await db
          .insert(sequenceSends)
          .values({
            enrollmentId: enr.enrId,
            stepId: step.id,
            status: "sent",
            sentAt: new Date(),
          })
          .onConflictDoNothing();
        sent++;
      } catch (e) {
        await db
          .insert(sequenceSends)
          .values({
            enrollmentId: enr.enrId,
            stepId: step.id,
            status: "failed",
            error: String(e),
          })
          .onConflictDoNothing();
        failed++;
      }
    }

    // 모든 스텝 처리 완료 → done
    const totalDone = await db
      .select({ stepId: sequenceSends.stepId })
      .from(sequenceSends)
      .where(eq(sequenceSends.enrollmentId, enr.enrId));
    if (totalDone.length >= steps.length) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "done" })
        .where(eq(sequenceEnrollments.id, enr.enrId));
    }
  }

  return { processed, sent, skipped, failed };
}

/** 시퀀스 목록 + 스텝 수 (관리자용) */
export async function listSequences(campaignId?: string | null) {
  return db
    .select()
    .from(messageSequences)
    .where(
      campaignId === undefined
        ? undefined
        : campaignId === null
          ? isNull(messageSequences.campaignId)
          : inArray(messageSequences.campaignId, [campaignId]),
    )
    .orderBy(asc(messageSequences.createdAt));
}
