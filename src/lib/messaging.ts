import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  leads,
  messageAutomationEnrollments,
  messageAutomations,
  messageAutomationSteps,
  messageSends,
  orders,
  type MessageAudience,
  type MessageAutomationTrigger,
} from "@/db/schema";
import { getActiveOffer, resolveCheckoutUrl } from "@/lib/funnel-offer";
import { sendSms } from "@/lib/solapi";

/** 문자 링크용 절대 도메인. env 미설정 시 Vercel 프로덕션 도메인으로 폴백 */
const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/$/, "");

/* ---------- 템플릿 변수 ---------- */

/** 템플릿의 {변수}를 치환 */
export function fillTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, k: string) => vars[k.trim()] ?? "");
}

/**
 * 캠페인·리드 컨텍스트로 문자 템플릿 변수 맵을 만든다.
 * {이름}{링크}{예약링크}{결제링크}{단톡방링크}{세일즈링크}{다운로드링크}{상품명}{마감시각}
 */
export async function buildMessageVars(
  campaignId: string | null,
  leadId: string,
  productName?: string,
): Promise<Record<string, string | undefined>> {
  let basePath = "";
  let downloadUrl = "";
  let groupChatUrl = "";
  if (campaignId) {
    const [c] = await db
      .select({
        slug: campaigns.slug,
        isDefault: campaigns.isDefault,
        downloadUrl: campaigns.downloadUrl,
        groupChatUrl: campaigns.groupChatUrl,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .catch(() => []);
    if (c && !c.isDefault) basePath = `/${c.slug}`;
    downloadUrl = c?.downloadUrl ?? "";
    groupChatUrl = c?.groupChatUrl ?? "";
  }
  const watchUrl = `${SITE}${basePath}/vod?l=${leadId}`;
  const bookingUrl = `${SITE}${basePath}/booking?l=${leadId}`;
  // 단톡방: 캠페인에 초대 링크가 있으면 그걸, 없으면 안내 페이지로
  const chatUrl = groupChatUrl || `${SITE}${basePath}/community?l=${leadId}`;

  let checkoutUrl = watchUrl;
  const salesUrl = `${SITE}${basePath}/sales?l=${leadId}`;
  let downloadPageUrl = "";
  if (campaignId) {
    const offer = await getActiveOffer(campaignId, "vod_bottom");
    if (offer) checkoutUrl = SITE + resolveCheckoutUrl(offer, { basePath, leadId });
    const salesOffer = await getActiveOffer(campaignId, "sales");
    if (salesOffer) downloadPageUrl = `${SITE}${basePath}/download?l=${leadId}`;
  }

  const [lead] = await db
    .select({ name: leads.name, vodExpiresAt: leads.vodExpiresAt })
    .from(leads)
    .where(eq(leads.id, leadId))
    .catch(() => []);

  return {
    링크: watchUrl,
    예약링크: bookingUrl,
    결제링크: checkoutUrl,
    단톡방링크: chatUrl,
    세일즈링크: salesUrl,
    다운로드링크: downloadUrl || downloadPageUrl || watchUrl,
    상품명: productName ?? "자료",
    이름: lead?.name ?? "회원",
    마감시각: lead?.vodExpiresAt
      ? lead.vodExpiresAt.toLocaleString("ko-KR", {
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "",
    leadId,
  };
}

/* ---------- 자동화 해석 ---------- */

type AutomationRow = typeof messageAutomations.$inferSelect;

/**
 * 캠페인에 적용되는 자동화 목록.
 * - 같은 key 의 캠페인 전용본이 있으면 전역 기본을 덮어씀
 * - key 없는(사용자 생성) 자동화는 캠페인 전용이면 그대로 포함
 */
export async function resolveAutomations(
  campaignId: string | null,
  trigger?: MessageAutomationTrigger,
): Promise<AutomationRow[]> {
  const rows = await db
    .select()
    .from(messageAutomations)
    .where(
      and(
        eq(messageAutomations.enabled, true),
        trigger ? eq(messageAutomations.trigger, trigger) : undefined,
        campaignId
          ? or(
              eq(messageAutomations.campaignId, campaignId),
              isNull(messageAutomations.campaignId),
            )
          : isNull(messageAutomations.campaignId),
      ),
    )
    .catch(() => []);

  // key 별로 campaign-specific 우선
  const byKey = new Map<string, AutomationRow>();
  const custom: AutomationRow[] = [];
  for (const r of rows) {
    if (!r.key) {
      if (r.campaignId === campaignId) custom.push(r); // 사용자 생성은 캠페인 것만
      continue;
    }
    const cur = byKey.get(r.key);
    if (!cur || (r.campaignId && !cur.campaignId)) byKey.set(r.key, r);
  }
  return [...byKey.values(), ...custom];
}

/* ---------- 등록 / 발송 ---------- */

async function audienceMatches(
  leadId: string,
  audience: MessageAudience,
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

/** 한 스텝을 발송(또는 skip) 하고 message_sends 에 기록. 이미 보낸 스텝은 무시. */
async function sendStep(opts: {
  leadId: string;
  phone: string;
  campaignId: string | null;
  step: typeof messageAutomationSteps.$inferSelect;
  immediate?: boolean;
}): Promise<"sent" | "skipped" | "failed"> {
  const { leadId, phone, campaignId, step, immediate } = opts;

  // 이미 보낸 스텝?
  const [dup] = await db
    .select({ id: messageSends.id })
    .from(messageSends)
    .where(and(eq(messageSends.leadId, leadId), eq(messageSends.stepId, step.id)))
    .limit(1);
  if (dup) return "skipped";

  if (!(await audienceMatches(leadId, step.audience))) {
    await db
      .insert(messageSends)
      .values({ leadId, stepId: step.id, status: "skipped" })
      .onConflictDoNothing();
    return "skipped";
  }

  try {
    const vars = await buildMessageVars(campaignId, leadId);
    const body = fillTemplate(step.body, vars);
    await sendSms(phone, body, immediate ? { immediate: true } : undefined);
    await db
      .insert(messageSends)
      .values({ leadId, stepId: step.id, status: "sent", sentAt: new Date() })
      .onConflictDoNothing();
    return "sent";
  } catch (e) {
    await db
      .insert(messageSends)
      .values({ leadId, stepId: step.id, status: "failed", error: String(e) })
      .onConflictDoNothing();
    return "failed";
  }
}

/**
 * 리드를 trigger 자동화에 등록하고, delay 0 스텝은 즉시 발송.
 * (signup_confirm 같은 "신청 즉시" 문자 = delay 0 스텝)
 */
export async function enrollLead(
  leadId: string,
  trigger: MessageAutomationTrigger,
  campaignId: string | null,
  anchorAt: Date = new Date(),
): Promise<void> {
  const autos = await resolveAutomations(campaignId, trigger);
  if (autos.length === 0) return;

  const [lead] = await db
    .select({ phone: leads.phone })
    .from(leads)
    .where(eq(leads.id, leadId));

  for (const auto of autos) {
    await db
      .insert(messageAutomationEnrollments)
      .values({ automationId: auto.id, leadId, anchorAt })
      .onConflictDoNothing();

    // delay 0 스텝 즉시 발송
    if (!lead?.phone) continue;
    const steps = await db
      .select()
      .from(messageAutomationSteps)
      .where(
        and(
          eq(messageAutomationSteps.automationId, auto.id),
          eq(messageAutomationSteps.enabled, true),
          eq(messageAutomationSteps.delayMinutes, 0),
        ),
      )
      .orderBy(asc(messageAutomationSteps.stepOrder));
    for (const step of steps) {
      await sendStep({
        leadId,
        phone: lead.phone,
        campaignId,
        step,
        immediate: trigger === "signup", // 신청 확인은 야간에도 즉시
      });
    }
  }
}

/** 이벤트 발생 시 해당 이벤트를 stop_on 에 가진 자동화의 active enrollment 를 중단 */
export async function stopAutomations(
  leadId: string,
  event: string,
): Promise<void> {
  const enrs = await db
    .select({
      id: messageAutomationEnrollments.id,
      stopOn: messageAutomations.stopOn,
    })
    .from(messageAutomationEnrollments)
    .innerJoin(
      messageAutomations,
      eq(messageAutomations.id, messageAutomationEnrollments.automationId),
    )
    .where(
      and(
        eq(messageAutomationEnrollments.leadId, leadId),
        eq(messageAutomationEnrollments.status, "active"),
      ),
    );
  const toStop = enrs.filter((e) => (e.stopOn ?? []).includes(event));
  if (toStop.length === 0) return;
  await db
    .update(messageAutomationEnrollments)
    .set({ status: "stopped" })
    .where(
      inArray(
        messageAutomationEnrollments.id,
        toStop.map((e) => e.id),
      ),
    );
}

/**
 * 도래한 자동화 스텝 발송. 크론(15분)에서 호출.
 * active enrollment 마다 anchorAt + step.delayMinutes <= now 인 미발송 스텝을 순서대로 처리.
 */
export async function runDueAutomationSteps(now = new Date()): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const active = await db
    .select({
      enrId: messageAutomationEnrollments.id,
      autoId: messageAutomationEnrollments.automationId,
      leadId: messageAutomationEnrollments.leadId,
      anchorAt: messageAutomationEnrollments.anchorAt,
    })
    .from(messageAutomationEnrollments)
    .where(eq(messageAutomationEnrollments.status, "active"))
    .catch(() => []);

  let processed = 0,
    sent = 0,
    skipped = 0,
    failed = 0;

  const stepCache = new Map<
    string,
    (typeof messageAutomationSteps.$inferSelect)[]
  >();
  const getSteps = async (autoId: string) => {
    if (!stepCache.has(autoId)) {
      stepCache.set(
        autoId,
        await db
          .select()
          .from(messageAutomationSteps)
          .where(
            and(
              eq(messageAutomationSteps.automationId, autoId),
              eq(messageAutomationSteps.enabled, true),
            ),
          )
          .orderBy(asc(messageAutomationSteps.stepOrder)),
      );
    }
    return stepCache.get(autoId)!;
  };

  for (const enr of active) {
    const steps = (await getSteps(enr.autoId)).filter(
      (s) => s.delayMinutes > 0,
    );
    if (steps.length === 0) {
      await db
        .update(messageAutomationEnrollments)
        .set({ status: "done" })
        .where(eq(messageAutomationEnrollments.id, enr.enrId));
      continue;
    }

    const [lead] = await db
      .select({ phone: leads.phone, campaignId: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, enr.leadId));

    const done = await db
      .select({ stepId: messageSends.stepId })
      .from(messageSends)
      .where(eq(messageSends.leadId, enr.leadId));
    const doneIds = new Set(done.map((d) => d.stepId));

    for (const step of steps) {
      if (doneIds.has(step.id)) continue;
      const dueAt = new Date(
        enr.anchorAt.getTime() + step.delayMinutes * 60_000,
      );
      if (dueAt > now) break; // 이후 스텝도 미래

      processed++;
      if (!lead?.phone) {
        await db
          .insert(messageSends)
          .values({
            leadId: enr.leadId,
            stepId: step.id,
            status: "failed",
            error: "연락처 없음",
          })
          .onConflictDoNothing();
        failed++;
        continue;
      }
      const r = await sendStep({
        leadId: enr.leadId,
        phone: lead.phone,
        campaignId: lead.campaignId,
        step,
      });
      if (r === "sent") sent++;
      else if (r === "skipped") skipped++;
      else failed++;
    }

    // 모든 delay>0 스텝 처리 완료 → done
    const totalDone = await db
      .select({ stepId: messageSends.stepId })
      .from(messageSends)
      .where(eq(messageSends.leadId, enr.leadId));
    const stepIds = new Set(steps.map((s) => s.id));
    const doneForThis = totalDone.filter((d) => stepIds.has(d.stepId)).length;
    if (doneForThis >= steps.length) {
      await db
        .update(messageAutomationEnrollments)
        .set({ status: "done" })
        .where(eq(messageAutomationEnrollments.id, enr.enrId));
    }
  }

  return { processed, sent, skipped, failed };
}
