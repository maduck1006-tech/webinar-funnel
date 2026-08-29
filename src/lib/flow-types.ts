export const FUNNEL_PAGE_TYPES = [
  "landing",
  "thankyou",
  "vod",
  "booking",
] as const;
export type FunnelPageType = (typeof FUNNEL_PAGE_TYPES)[number];

/** 기본 캠페인 기준 경로 (비기본 캠페인은 앞에 /{slug} 붙음) */
export const PAGE_META: Record<
  FunnelPageType,
  { title: string; step: string; path: string }
> = {
  landing: { title: "랜딩(신청)", step: "2단계", path: "/" },
  thankyou: { title: "땡큐 + 저가상품", step: "3단계", path: "/thankyou" },
  vod: { title: "VOD 시청", step: "4단계", path: "/vod" },
  booking: { title: "상담 예약", step: "5단계", path: "/booking" },
};

export type Exit = {
  blockId: string;
  blockType: string;
  label: string;
  target: string;
  targetType: FunnelPageType | null;
};

export type FunnelNode = {
  pageType: FunnelPageType;
  exits: Exit[];
};

/** href/nextPath 값 → 어떤 page_type 을 가리키는지 (basePath 제거 후 판정) */
export function resolvePageType(
  target: string,
  basePath = "",
): FunnelPageType | null {
  if (!target) return null;
  let clean = target.split("?")[0].split("#")[0].replace(/\/$/, "");
  if (basePath && clean.startsWith(basePath)) clean = clean.slice(basePath.length);
  clean = clean || "/";
  for (const t of FUNNEL_PAGE_TYPES) {
    if (clean === PAGE_META[t].path) return t;
  }
  return null;
}

/** 링크로 표현되지 않는 시스템 전환 (웹훅/문자/크론) — 흐름도에 점선 */
export const SYSTEM_TRANSITIONS: {
  from: FunnelPageType;
  to: FunnelPageType;
  label: string;
}[] = [
  { from: "thankyou", to: "vod", label: "결제성공 웹훅 → 시청권한 부여" },
  { from: "vod", to: "booking", label: "결제완료 문자의 예약 링크" },
  { from: "landing", to: "vod", label: "리마인더 문자(24/12/1h) 링크" },
];
