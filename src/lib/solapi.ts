import { SolapiMessageService } from "solapi";
import type { messageTrigger } from "@/db/schema";

type Trigger = (typeof messageTrigger.enumValues)[number];

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = process.env.SOLAPI_SENDER ?? "";

let _service: SolapiMessageService | null = null;
function service() {
  if (!apiKey || !apiSecret) throw new Error("SOLAPI credentials not set");
  _service ??= new SolapiMessageService(apiKey, apiSecret);
  return _service;
}

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "");

/**
 * 트리거별 문자 본문. 알림톡 템플릿 승인 후에는 templateId 방식으로 교체.
 * 시간이 지날수록 혜택이 줄어드는 톤 (PRD 3.3)
 */
export function renderMessage(
  trigger: Trigger,
  vars: { leadId: string; deadline?: string; productName?: string },
): string {
  const watchUrl = `${SITE}/vod?l=${vars.leadId}`;
  switch (trigger) {
    case "signup_confirm":
      return `강의 신청이 완료되었습니다!\n아래 링크에서 지금 바로 시청하실 수 있어요.\n${watchUrl}`;
    case "reminder_24h":
      return `[무료 강의] 아직 강의를 보지 않으셨어요.\n시청 마감까지 24시간 남았습니다.\n지금 보기 → ${watchUrl}`;
    case "reminder_12h_left":
      return `[마감 임박] 강의 시청 마감까지 12시간!\n마감 후에는 다시 볼 수 없습니다.\n${watchUrl}`;
    case "reminder_1h_left":
      return `[마지막 안내] 강의 시청 마감 1시간 전입니다.\n지금이 마지막 기회예요.\n${watchUrl}`;
    case "pre_payment_nudge":
      return `강의는 잘 보고 계신가요?\n지금 함께 보면 좋은 ${vars.productName ?? "자료"}를 준비했어요 → ${watchUrl}`;
    case "payment_success":
      return `결제가 완료되었습니다. 감사합니다!\n자료 다운로드 및 1:1 상담 예약 안내 → ${SITE}/booking?l=${vars.leadId}`;
    case "payment_cancel_admin":
      return `[관리자 알림] 결제 취소 발생 - lead ${vars.leadId}`;
  }
}

export async function sendSms(to: string, text: string) {
  if (process.env.SOLAPI_DRY_RUN === "1" || process.env.SOLAPI_DRY_RUN === "true") {
    console.info(`[solapi:dry-run] → ${to}: ${text.replace(/\n/g, " ").slice(0, 60)}`);
    return { dryRun: true } as const;
  }
  const res = await service().send({ to, from: sender, text });
  return res;
}
