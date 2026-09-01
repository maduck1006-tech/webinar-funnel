import type { Campaign } from "@/db/schema";
import { FUNNEL_PAGE_TYPES } from "@/lib/flow-types";

export type FlowStep = { pageType: string; enabled: boolean };

/** 단계 메타 (Puck 편집 페이지 + 앱 관리 페이지 모두 포함) */
export const STEP_META: Record<
  string,
  { title: string; path: string; puck: boolean; note?: string }
> = {
  landing: { title: "랜딩(신청)", path: "/", puck: true },
  sales: { title: "세일즈 페이지", path: "/sales", puck: true },
  thankyou: { title: "땡큐 + 저가상품", path: "/thankyou", puck: true },
  vod: { title: "VOD 시청", path: "/vod", puck: true },
  course: {
    title: "강의실",
    path: "/course",
    puck: false,
    note: "강의 내용은 상품 관리 → 강의 구성에서 편집",
  },
  delivery: { title: "다운로드 전달", path: "/download", puck: true },
  booking: { title: "상담 예약", path: "/booking", puck: true },
  groupchat: { title: "단톡방 입장", path: "/community", puck: true },
  membership: { title: "멤버십 전환", path: "/membership", puck: true },
};

/** 빌더에서 추가 가능한 단계 후보 */
export const ADDABLE_STEPS = Object.keys(STEP_META);

const PRESETS: Record<string, string[]> = {
  evergreen_webinar: ["landing", "thankyou", "vod", "__terminal__"],
  live_webinar_reg: ["landing", "thankyou", "vod", "__terminal__"],
  vod_course: ["sales", "thankyou", "course"],
  ebook: ["sales", "thankyou", "delivery"],
  paid_consult: ["sales", "thankyou", "booking"],
};

function presetFor(
  campaign: Pick<Campaign, "funnelType" | "terminalStep">,
): string[] {
  const raw = PRESETS[campaign.funnelType] ?? PRESETS.evergreen_webinar;
  return raw.map((pt) => (pt === "__terminal__" ? campaign.terminalStep : pt));
}

const KNOWN = new Set<string>([...FUNNEL_PAGE_TYPES, ...Object.keys(STEP_META)]);

/**
 * 이 캠페인의 실제 단계 목록 (표시 순서 + enabled).
 * campaign.flow 가 있으면 그대로, 없으면 funnel_type 프리셋.
 */
export function resolveFlowSteps(
  campaign: Pick<Campaign, "funnelType" | "terminalStep" | "flow">,
): FlowStep[] {
  if (campaign.flow?.steps?.length) {
    return campaign.flow.steps
      .filter((s) => KNOWN.has(s.pageType))
      .map((s) => ({ pageType: s.pageType, enabled: s.enabled }));
  }
  return presetFor(campaign).map((pageType) => ({ pageType, enabled: true }));
}

/** 캠페인 생성/타입변경 시 flow 시드 */
export function seedFlow(
  campaign: Pick<Campaign, "funnelType" | "terminalStep">,
): { steps: FlowStep[] } {
  return {
    steps: presetFor(campaign).map((pageType) => ({ pageType, enabled: true })),
  };
}

/** 현재 단계 다음에 오는 enabled 단계의 pageType (없으면 null) */
export function nextEnabledStep(
  steps: FlowStep[],
  current: string,
): string | null {
  const on = steps.filter((s) => s.enabled).map((s) => s.pageType);
  const i = on.indexOf(current);
  if (i === -1 || i === on.length - 1) return null;
  return on[i + 1];
}

/** 마지막 enabled 단계 (종착) */
export function lastEnabledStep(steps: FlowStep[]): string | null {
  const on = steps.filter((s) => s.enabled);
  return on.length ? on[on.length - 1].pageType : null;
}

/** pageType → 이 캠페인 기준 경로 (basePath 접두, leadId 옵션) */
export function stepPath(
  pageType: string,
  basePath: string,
  leadId?: string | null,
): string {
  const p = STEP_META[pageType]?.path ?? "/";
  const path = `${basePath}${p === "/" ? "" : p}` || "/";
  return leadId ? `${path}?l=${leadId}` : path;
}

/** "랜딩 → 땡큐 → VOD → 단톡방" 한 줄 요약 (enabled 만) */
export function flowSummary(steps: FlowStep[]): string {
  return steps
    .filter((s) => s.enabled)
    .map((s) => STEP_META[s.pageType]?.title ?? s.pageType)
    .join("  →  ");
}
