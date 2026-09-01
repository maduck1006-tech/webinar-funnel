import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationTriggers,
  campaignMessages,
  campaigns,
  leads,
  messageLogs,
  type messageTrigger,
} from "@/db/schema";
import { getActiveOffer, resolveCheckoutUrl } from "@/lib/funnel-offer";
import { renderMessage, sendSms } from "@/lib/solapi";

type Trigger = (typeof messageTrigger.enumValues)[number];

/** 문자 링크용 절대 도메인. env 미설정 시 Vercel 프로덕션 도메인으로 폴백 */
const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/$/, "");

export type ResolvedTrigger = {
  enabled: boolean;
  /** 사용자 템플릿(있으면). 없으면 코드 기본 렌더 사용 */
  template: string | null;
  offsetHours: number | null;
};

/**
 * 트리거 설정 해석: campaign_messages 오버라이드 → automation_triggers 전역 → 기본(enabled)
 */
export async function resolveTrigger(
  campaignId: string | null,
  trigger: Trigger,
): Promise<ResolvedTrigger> {
  if (campaignId) {
    const [ov] = await db
      .select()
      .from(campaignMessages)
      .where(
        and(
          eq(campaignMessages.campaignId, campaignId),
          eq(campaignMessages.trigger, trigger),
        ),
      );
    if (ov) {
      return {
        enabled: ov.enabled,
        template: ov.template || null,
        offsetHours: ov.offsetHours,
      };
    }
  }
  const [g] = await db
    .select()
    .from(automationTriggers)
    .where(eq(automationTriggers.key, trigger))
    .catch(() => []);
  if (g) {
    return {
      enabled: g.enabled,
      template: g.template || null,
      offsetHours: g.offsetHours,
    };
  }
  return { enabled: true, template: null, offsetHours: null };
}

function fill(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, k: string) => vars[k.trim()] ?? "");
}

/**
 * 캠페인 인지 문자 본문 생성.
 * - 캠페인 basePath 를 붙인 링크 사용
 * - 사용자 템플릿이 있으면 변수 치환, 없으면 코드 기본(renderMessage)
 */
export async function renderCampaignMessage(
  campaignId: string | null,
  trigger: Trigger,
  vars: { leadId: string; productName?: string },
): Promise<string> {
  let basePath = "";
  let downloadUrl = "";
  if (campaignId) {
    const [c] = await db
      .select({
        slug: campaigns.slug,
        isDefault: campaigns.isDefault,
        downloadUrl: campaigns.downloadUrl,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .catch(() => []);
    if (c && !c.isDefault) basePath = `/${c.slug}`;
    downloadUrl = c?.downloadUrl ?? "";
  }
  const watchUrl = `${SITE}${basePath}/vod?l=${vars.leadId}`;
  const bookingUrl = `${SITE}${basePath}/booking?l=${vars.leadId}`;

  // 결제링크: 활성 저가상품(vod_bottom)의 자체 토스 결제 페이지 + lead 식별자.
  // 활성 상품이 없으면 시청링크로 폴백(문자에 깨진 링크 방지).
  let checkoutUrl = watchUrl;
  if (campaignId) {
    const offer = await getActiveOffer(campaignId, "vod_bottom");
    if (offer) {
      checkoutUrl =
        SITE +
        resolveCheckoutUrl(offer, { basePath, leadId: vars.leadId });
    }
  }

  const resolved = await resolveTrigger(campaignId, trigger);
  if (resolved.template) {
    const [lead] = await db
      .select({ name: leads.name, vodExpiresAt: leads.vodExpiresAt })
      .from(leads)
      .where(eq(leads.id, vars.leadId))
      .catch(() => []);
    return fill(resolved.template, {
      링크: watchUrl,
      예약링크: bookingUrl,
      결제링크: checkoutUrl,
      다운로드링크: downloadUrl || watchUrl,
      상품명: vars.productName ?? "자료",
      이름: lead?.name ?? "회원",
      마감시각: lead?.vodExpiresAt
        ? lead.vodExpiresAt.toLocaleString("ko-KR", {
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "",
      leadId: vars.leadId,
    });
  }

  // 코드 기본 렌더 (basePath 미반영이라 링크만 치환)
  const base = renderMessage(trigger, vars);
  return base
    .replaceAll(`${SITE}/vod?l=${vars.leadId}`, watchUrl)
    .replaceAll(`${SITE}/booking?l=${vars.leadId}`, bookingUrl);
}

/**
 * 트리거 문자를 리드당 1회만 발송 (message_logs unique 로 중복 방지).
 * 트리거가 꺼져 있으면 아무것도 안 함.
 */
export async function sendTriggerOnce(opts: {
  leadId: string;
  phone: string;
  campaignId: string | null;
  trigger: Trigger;
  productName?: string;
}): Promise<"sent" | "skipped" | "failed" | "disabled"> {
  const cfg = await resolveTrigger(opts.campaignId, opts.trigger);
  if (!cfg.enabled) return "disabled";

  const dup = await db
    .select({ id: messageLogs.id })
    .from(messageLogs)
    .where(
      and(
        eq(messageLogs.leadId, opts.leadId),
        eq(messageLogs.trigger, opts.trigger),
      ),
    )
    .limit(1);
  if (dup.length) return "skipped";

  const [log] = await db
    .insert(messageLogs)
    .values({ leadId: opts.leadId, trigger: opts.trigger })
    .returning({ id: messageLogs.id });
  try {
    const text = await renderCampaignMessage(opts.campaignId, opts.trigger, {
      leadId: opts.leadId,
      productName: opts.productName,
    });
    // 신청 직후 확인 문자는 야간이어도 즉시 발송 (사용자가 방금 신청함)
    await sendSms(opts.phone, text, {
      immediate: opts.trigger === "signup_confirm",
    });
    await db
      .update(messageLogs)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(messageLogs.id, log.id));
    return "sent";
  } catch (e) {
    await db
      .update(messageLogs)
      .set({ status: "failed", error: String(e) })
      .where(eq(messageLogs.id, log.id));
    return "failed";
  }
}
