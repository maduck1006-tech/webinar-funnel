"use client";

/**
 * 클라이언트 전환 이벤트 발화. Meta Pixel(fbq) + GA4(gtag) 둘 다로 보냄.
 * 스크립트는 <CampaignTracking> 이 주입. 미주입 환경에서도 안전(no-op).
 */
type TrackEvent =
  | "page_view"
  | "lead"
  | "view_content"
  | "add_to_cart"
  | "checkout_start"
  | "purchase";

const META_MAP: Record<TrackEvent, string> = {
  page_view: "PageView",
  lead: "Lead",
  view_content: "ViewContent", // 오퍼 페이지 조회 — 리타게팅 오디언스
  add_to_cart: "AddToCart", // 결제창(주문서) 도달
  checkout_start: "InitiateCheckout",
  purchase: "Purchase",
};
const GA_MAP: Record<TrackEvent, string> = {
  page_view: "page_view",
  lead: "generate_lead",
  view_content: "view_item",
  add_to_cart: "add_to_cart",
  checkout_start: "begin_checkout",
  purchase: "purchase",
};

type Params = {
  value?: number;
  currency?: string;
  content_name?: string;
  [k: string]: unknown;
};

export function track(event: TrackEvent, params: Params = {}, eventId?: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    fbq?: (...a: unknown[]) => void;
    gtag?: (...a: unknown[]) => void;
  };
  try {
    // 4번째 인자 eventID → 서버 Conversions API 와 중복 제거
    if (eventId) w.fbq?.("track", META_MAP[event], params, { eventID: eventId });
    else w.fbq?.("track", META_MAP[event], params);
  } catch {
    /* noop */
  }
  try {
    w.gtag?.("event", GA_MAP[event], params);
  } catch {
    /* noop */
  }
}

/** sessionStorage 로 1회만 발화 (예: 결제 리다이렉트 Purchase) */
export function trackOnce(
  key: string,
  event: TrackEvent,
  params: Params = {},
  eventId?: string,
) {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* 프라이빗 모드 등 — 그냥 발화 */
  }
  track(event, params, eventId);
}
