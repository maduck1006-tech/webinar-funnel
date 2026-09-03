import { SolapiMessageService } from "solapi";
import type { messageTrigger } from "@/db/schema";

type Trigger = (typeof messageTrigger.enumValues)[number];

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = process.env.SOLAPI_SENDER ?? "";

let _service: SolapiMessageService | null = null;
export function solapiService() {
  if (!apiKey || !apiSecret) throw new Error("SOLAPI credentials not set");
  _service ??= new SolapiMessageService(apiKey, apiSecret);
  return _service;
}
export const solapiConfigured = Boolean(apiKey && apiSecret);
export const kakaoChannelId = process.env.SOLAPI_KAKAO_CHANNEL_ID ?? "";

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
    // P2 구독(멤버십) — docs/toss-payments-plan.md §11. 문구는 seed/자동화에서 오버라이드.
    case "membership_offer":
      return `${vars.productName ?? "멤버십"} 안내를 보내드려요.\n첫 1개월 무료로 이용하실 수 있습니다 → ${SITE}/membership?l=${vars.leadId}`;
    case "membership_trial_ending":
      return `무료 이용 기간이 곧 종료됩니다.\n3일 뒤부터 정기 결제가 시작돼요. 해지를 원하시면 지금 알려주세요.`;
    case "membership_renewed":
      return `멤버십 결제가 정상 처리되었습니다. 계속 이용해 주셔서 감사합니다.`;
    case "membership_payment_failed":
      return `멤버십 결제에 실패했어요.\n카드 상태를 확인해 주세요. 며칠 내 재시도됩니다.`;
    case "membership_canceled":
      return `멤버십이 해지되었습니다.\n남은 이용 기간까지는 계속 시청하실 수 있어요.`;
  }
}

/**
 * 야간 발송 제한. 이 시간대(KST)에 걸리면 Solapi 예약발송으로 다음 아침에 전송.
 *   SMS_QUIET_START (기본 21) ~ SMS_QUIET_END (기본 8)
 * 예: 21시~다음날 8시 사이 요청 → 그날/다음날 08:00 KST 로 예약.
 */
function quietHours() {
  const start = Number(process.env.SMS_QUIET_START ?? 0);
  const end = Number(process.env.SMS_QUIET_END ?? 8);
  return { start, end };
}

/** KST 기준 Date 구성요소 (UTC+9, DST 없음) */
function kstParts(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return {
    y: k.getUTCFullYear(),
    m: k.getUTCMonth(),
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
  };
}

/**
 * 지금이 야간이면 다음 발송 가능 시각을 'YYYY-MM-DD HH:mm:ss' (KST) 문자열로 반환.
 * 야간이 아니면 undefined (= 즉시 발송).
 */
export function scheduledSendTime(now = new Date()): string | undefined {
  const { start, end } = quietHours();
  const { y, m, day, hour } = kstParts(now);
  const inQuiet =
    start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!inQuiet) return undefined;

  // 목표: end 시 정각 KST. 저녁(>= start)이면 다음날, 새벽(< end)이면 당일.
  const target = new Date(Date.UTC(y, m, day, end, 0, 0));
  if (hour >= start) target.setUTCDate(target.getUTCDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${target.getUTCFullYear()}-${p(target.getUTCMonth() + 1)}-${p(
    target.getUTCDate(),
  )} ${p(end)}:00:00`;
}

const DRY =
  process.env.SOLAPI_DRY_RUN === "1" || process.env.SOLAPI_DRY_RUN === "true";

export type KakaoSend = {
  /** kakao_templates.solapiTemplateId */
  templateId: string;
  /** 발신프로필(채널) ID. 비우면 env SOLAPI_KAKAO_CHANNEL_ID */
  channelId?: string;
  /** 템플릿 변수 이름 → 채워넣을 값. 예: { "강의명": "실전 워크북" } */
  variables?: Record<string, string>;
};

/**
 * 한 통 발송. kakao 를 주면 알림톡으로 시도하고, 실패하면 text 를 문자로 대체발송한다.
 * (알림톡은 카톡 미사용/채널차단 시 실패 → text 가 안전망)
 *
 * @param opts.immediate  야간 차단 무시하고 즉시 발송
 */
export async function sendMessage(
  to: string,
  text: string,
  opts?: { immediate?: boolean; kakao?: KakaoSend | null },
) {
  const scheduledDate = opts?.immediate ? undefined : scheduledSendTime();
  const kakao = opts?.kakao ?? null;

  if (DRY) {
    console.info(
      `[solapi:dry-run]${kakao ? " (알림톡)" : ""}${
        scheduledDate ? ` (예약 ${scheduledDate})` : ""
      } → ${to}: ${text.replace(/\n/g, " ").slice(0, 60)}`,
    );
    return { dryRun: true, scheduledDate, channel: kakao ? "alimtalk" : "sms" } as const;
  }

  const base = {
    to,
    from: sender,
    ...(scheduledDate ? { scheduledDate } : {}),
  };

  if (kakao) {
    try {
      const res = await solapiService().send({
        ...base,
        kakaoOptions: {
          pfId: kakao.channelId || kakaoChannelId,
          templateId: kakao.templateId,
          variables: kakao.variables ?? {},
          // 알림톡 실패 시 솔라피가 문자로 자동 대체
          disableSms: false,
        },
        // 대체발송용 본문
        text,
      });
      return { ...res, channel: "alimtalk" } as const;
    } catch (e) {
      console.warn("[solapi] 알림톡 실패 → 문자 대체", e);
    }
  }

  const res = await solapiService().send({ ...base, text });
  return { ...res, channel: "sms" } as const;
}

/** @deprecated sendMessage 를 쓰세요. 기존 호출부 호환용 래퍼. */
export async function sendSms(
  to: string,
  text: string,
  opts?: { immediate?: boolean },
) {
  return sendMessage(to, text, opts);
}
