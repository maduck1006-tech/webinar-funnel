/**
 * 퍼널 템플릿 레지스트리 (docs/funnel-templates-plan.md · T1)
 * 우리가 큐레이션하는 상수. 캠페인 생성 시 flow + 페이지 + CRM 자동화(꺼짐)를 한 번에 시드.
 *
 * automations: 캠페인 전용(campaignId 지정)으로 생성, enabled=false.
 *  - key 가 전역 자동화와 같으면 그 캠페인에서 전역본을 덮어씀(= 끄기 가능).
 *  - steps.delayMinutes: 양수(anchor 이후)만. day 드립 = day*1440.
 */

const D = 24 * 60;
const H = 60;

export type TemplateAutomation = {
  key: string;
  name: string;
  trigger:
    | "signup"
    | "watch_start"
    | "purchase"
    | "booking"
    | "cart_abandon"
    | "event_registered";
  stopOn: string[];
  enabled?: boolean; // 기본 false
  steps: {
    delayMinutes: number;
    audience: "all" | "not_watched" | "not_purchased" | "not_booked";
    body: string;
  }[];
};

export type ProductSlot = {
  key: string;
  label: string;
  placement: "both" | "thankyou" | "vod_bottom" | "sales";
  productType: "workbook" | "ebook" | "vod_course" | "coaching" | "membership";
  priceMode?: "paid" | "free";
  required: boolean;
};

export type FunnelTemplate = {
  key: string;
  name: string;
  tagline: string;
  icon: string;
  ladder: string;
  funnelType: string;
  terminalStep: string;
  steps: string[];
  productSlots: ProductSlot[];
  automations: TemplateAutomation[];
  /** 전역 자동화 중 이 퍼널에서 끌 것 (campaign 전용본 enabled=false 로 생성) */
  disableGlobal?: string[];
  crmNote: string;
};

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  /* ───────────────────────── 무료 세미나 (에버그린) ───────────────────────── */
  {
    key: "evergreen_webinar",
    name: "무료 세미나 퍼널",
    tagline: "무료 강의로 신뢰를 쌓고 저가 상품·상담으로 전환",
    icon: "🎥",
    ladder: "presentation",
    funnelType: "evergreen_webinar",
    terminalStep: "booking",
    steps: ["landing", "thankyou", "vod", "booking"],
    productSlots: [
      {
        key: "workbook",
        label: "저가 워크북/자료 (땡큐·VOD 범프)",
        placement: "both",
        productType: "workbook",
        priceMode: "paid",
        required: false,
      },
    ],
    automations: [],
    crmNote:
      "신청확인·소프오페라·시청마감·봤는데 안 산·장바구니 이탈은 전역 자동 메시지로 이미 적용됩니다. 문구만 검토하세요.",
  },

  /* ───────────────────────── 무료 상담 예약 ───────────────────────── */
  {
    key: "free_consult",
    name: "무료 상담 예약 퍼널",
    tagline: "고가 상품은 페이지가 아니라 통화에서 판다 (Book-a-Call)",
    icon: "📞",
    ladder: "backend",
    funnelType: "paid_consult",
    terminalStep: "booking",
    steps: ["landing", "thankyou", "booking"],
    productSlots: [
      {
        key: "consult",
        label: "상담권 (유료면 등록, 무료면 비워두기)",
        placement: "sales",
        productType: "coaching",
        priceMode: "paid",
        required: false,
      },
    ],
    disableGlobal: ["soap_opera", "watch_deadline"],
    automations: [
      {
        key: "consult_intake",
        name: "상담 신청 → 예약 유도",
        trigger: "signup",
        stopOn: ["booking"],
        steps: [
          {
            delayMinutes: 0,
            audience: "all",
            body: "{이름}님, 상담 신청 접수됐어요. 아직 시간은 안 잡히셨어요 — 여기서 편한 시간을 골라주세요.\n👉 {예약링크}\n통화 전 3분 영상을 먼저 보시면 상담이 훨씬 알차요.",
          },
          {
            delayMinutes: 1 * H,
            audience: "not_booked",
            body: "{이름}님, 시간표가 매주 빨리 차요. 이번 주 남은 자리 얼마 안 됩니다.\n👉 {예약링크}",
          },
          {
            delayMinutes: 1 * D,
            audience: "not_booked",
            body: "{이름}님, 아직 상담 시간을 안 잡으셨네요. 이 링크는 곧 닫힙니다.\n👉 {예약링크}",
          },
          {
            delayMinutes: 3 * D,
            audience: "not_booked",
            body: "마지막 안내예요. 오늘 안 잡으시면 대기 명단으로 넘어갑니다.\n👉 {예약링크}",
          },
        ],
      },
      {
        key: "consult_prep",
        name: "예약 확정 → 통화 준비",
        trigger: "booking",
        stopOn: [],
        steps: [
          {
            delayMinutes: 0,
            audience: "all",
            body: "{이름}님, 상담 확정됐어요! 통화 전 준비할 것:\n1) 조용한 곳 2) 필기도구 3) 지금 겪는 가장 큰 고민 1가지\n이 3가지만 준비되면 30분이 확 바뀝니다.",
          },
        ],
      },
    ],
    crmNote:
      "예약 전 리마인더(전날·1시간 전)는 되는시간 자체 알림을 켜두세요.",
  },

  /* ───────────────────────── 챌린지 과정 ───────────────────────── */
  {
    key: "challenge",
    name: "챌린지 과정 퍼널",
    tagline: "5일간 매일 미션 → 성취감·커뮤니티 → 마지막 날 유료 오퍼",
    icon: "🔥",
    ladder: "presentation",
    funnelType: "vod_course",
    terminalStep: "sales",
    steps: ["landing", "thankyou", "course", "sales"],
    productSlots: [
      {
        key: "challenge_content",
        label: "챌린지 콘텐츠 (무료 강의 · 레슨마다 drip 0~4일)",
        placement: "sales",
        productType: "vod_course",
        priceMode: "free",
        required: true,
      },
      {
        key: "grad_offer",
        label: "졸업 오퍼 (유료 본상품)",
        placement: "sales",
        productType: "vod_course",
        priceMode: "paid",
        required: true,
      },
    ],
    disableGlobal: ["soap_opera", "watch_deadline"],
    automations: [
      {
        key: "challenge_daily",
        name: "챌린지 5일 데일리",
        trigger: "signup",
        stopOn: [],
        steps: [
          {
            delayMinutes: 0,
            audience: "all",
            body: "{이름}님, 5일 챌린지 시작합니다! 먼저 단톡방에 들어오세요.\n👉 {단톡방링크}\nDay 1 미션은 여기: {강의실링크}",
          },
          {
            delayMinutes: 1 * D,
            audience: "all",
            body: "Day 2 열렸어요. 어제 미션 인증 안 하신 분, 지금이라도 단톡방에 올려주세요.\n👉 {강의실링크}",
          },
          {
            delayMinutes: 2 * D,
            audience: "all",
            body: "Day 3. 보통 여기서 절반이 포기해요. {이름}님은 남으실 거죠?\n👉 {강의실링크}",
          },
          {
            delayMinutes: 3 * D,
            audience: "all",
            body: "Day 4. 내일이 마지막이에요. 오늘 미션이 제일 중요합니다.\n👉 {강의실링크}",
          },
          {
            delayMinutes: 4 * D,
            audience: "all",
            body: "Day 5 — 마지막 미션 + 다음 단계 안내가 오늘 들어있어요.\n👉 {강의실링크}",
          },
        ],
      },
      {
        key: "challenge_grad",
        name: "졸업 → 유료 오퍼",
        trigger: "signup",
        stopOn: ["purchase"],
        steps: [
          {
            delayMinutes: 5 * D,
            audience: "not_purchased",
            body: "{이름}님, 5일 완주 축하해요! 여기서 멈추지 마세요. 다음 단계는 이겁니다.\n👉 {세일즈링크}",
          },
          {
            delayMinutes: 6 * D,
            audience: "not_purchased",
            body: "어제 안내한 {상품명}, 챌린지 완주자 특가는 오늘까지예요.\n👉 {세일즈링크}",
          },
        ],
      },
    ],
    crmNote:
      "단톡방(오픈카톡) 링크를 캠페인 설정에 꼭 넣으세요 — 챌린지는 커뮤니티가 엔진입니다.",
  },

  /* ───────────────────────── 전자책·트립와이어 ───────────────────────── */
  {
    key: "ebook_tripwire",
    name: "전자책·트립와이어 퍼널",
    tagline: "저가 상품으로 광고비 회수 + 구매자 리스트 확보 (SLO)",
    icon: "📕",
    ladder: "frontend",
    funnelType: "ebook",
    terminalStep: "sales",
    steps: ["sales", "thankyou", "delivery"],
    productSlots: [
      {
        key: "main",
        label: "본상품 (저가 전자책)",
        placement: "sales",
        productType: "ebook",
        priceMode: "paid",
        required: true,
      },
      {
        key: "bump",
        label: "오더범프 상품 (선택)",
        placement: "sales",
        productType: "ebook",
        priceMode: "paid",
        required: false,
      },
    ],
    automations: [
      {
        key: "ebook_deliver",
        name: "결제 완료 → 전달 + 크로스셀",
        trigger: "purchase",
        stopOn: [],
        steps: [
          {
            delayMinutes: 0,
            audience: "all",
            body: "{이름}님, 결제 완료! 바로 받으세요.\n📎 {다운로드링크}\n폰에서 다시 보려면: {라이브러리링크}",
          },
          {
            delayMinutes: 2 * D,
            audience: "all",
            body: "{이름}님, {상품명} 잘 보고 계세요? 실전으로 넘어갈 준비 되셨으면 이것도 보세요.\n👉 {세일즈링크}",
          },
        ],
      },
    ],
    crmNote:
      "장바구니 이탈 복구는 전역 자동 메시지로 이미 적용됩니다.",
  },
];

export function getTemplate(key: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.key === key);
}
