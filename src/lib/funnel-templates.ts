/**
 * 퍼널 템플릿 레지스트리 (docs/funnel-templates-plan.md · T1)
 * 우리가 큐레이션하는 상수. 캠페인 생성 시 flow + 페이지 + CRM 자동화(꺼짐)를 한 번에 시드.
 *
 * automations: 캠페인 전용(campaignId 지정)으로 생성, enabled=false.
 *  - key 가 전역 자동화와 같으면 그 캠페인에서 전역본을 덮어씀(= 끄기 가능).
 *  - steps.delayMinutes: 양수(anchor 이후)만. day 드립 = day*1440.
 */

import type { FunnelData } from "@/puck/defaults";

const D = 24 * 60;
const H = 60;

const root = { props: { theme: "dark", topbarText: "", topbarCtaLabel: "", topbarCtaHref: "#apply", topbarDeadlineIso: "", topbarRushSeconds: 0 } };
/** 템플릿용 랜딩(신청) 페이지 헬퍼 — Hero + 불릿 + LeadForm */
function optinPage(o: {
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  submitLabel: string;
  note: string;
  topbar: string;
}): FunnelData {
  return {
    root: { props: { ...root.props, topbarText: o.topbar, topbarCtaLabel: "지금 신청" } },
    content: [
      { type: "Hero", props: { id: "hero", image: "", eyebrow: o.eyebrow, title: o.title, subtitle: o.subtitle, height: "tall" } },
      { type: "Bullets", props: { id: "list", title: "신청하면", items: o.bullets.map((t) => ({ text: t })) } },
      { type: "Heading", props: { id: "h", eyebrow: "", text: "지금 신청하세요", level: 2, align: "center" } },
      { type: "LeadForm", props: { id: "form", headline: "", submitLabel: o.submitLabel, note: o.note, nextPath: "{{next}}", sticky: true } },
    ],
  } as FunnelData;
}

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
  /** 템플릿 맞춤 페이지 카피 (없으면 defaultPages 사용) */
  pageOverrides?: Partial<Record<string, FunnelData>>;
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
    pageOverrides: {
      landing: optinPage({
        topbar: "무료 1:1 상담 신청",
        eyebrow: "무료 · 30분 화상 상담",
        title: "지금 상황에 맞는\n다음 한 걸음, 같이 짚어드려요",
        subtitle: "혼자 고민하지 마세요.\n30분이면 방향이 잡힙니다.",
        bullets: ["신청 후 편한 시간 선택 (10초)", "통화 전 3분 영상으로 미리 준비", "부담 없이, 파는 자리 아닙니다"],
        submitLabel: "무료 상담 신청하기",
        note: "신청 후 바로 예약 페이지로 이동합니다",
      }),
    },
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
    pageOverrides: {
      landing: optinPage({
        topbar: "5일 무료 챌린지",
        eyebrow: "무료 · 5일 챌린지",
        title: "5일이면 바뀝니다.\n혼자 말고 같이 하세요",
        subtitle: "매일 미션 하나.\n단톡방에서 인증하고 끝까지.",
        bullets: ["매일 아침 미션 도착 (5일)", "단톡방에서 같이 인증", "완주하면 다음 단계 특가"],
        submitLabel: "챌린지 신청하기 (무료)",
        note: "신청 후 단톡방 입장 안내가 갑니다",
      }),
      thankyou: {
        root: root,
        content: [
          { type: "Heading", props: { id: "h", eyebrow: "신청 완료", text: "먼저 단톡방부터 들어오세요", level: 1, align: "center" } },
          { type: "Text", props: { id: "t", text: "챌린지는 혼자 하면 3일 안에 그만둬요.\n단톡방에서 같이 해야 끝까지 갑니다.", align: "center", style: "body" } },
          { type: "CTAButton", props: { id: "j", label: "단톡방 입장하기", sub: "챌린지 신청자 전용", href: "{{groupchat}}", variant: "primary" } },
          { type: "CTAButton", props: { id: "n", label: "Day 1 미션 보기", sub: "", href: "{{next}}", variant: "ghost" } },
        ],
      } as FunnelData,
    },
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

  /* ───────────────────────── 리드마그넷 (무료 자료) ───────────────────────── */
  {
    key: "lead_magnet",
    name: "무료 자료(리드마그넷) 퍼널",
    tagline: "무료 미끼로 이상적 고객만 낚는다 — 사다리 첫 계단",
    icon: "🎁",
    ladder: "lead",
    funnelType: "ebook",
    terminalStep: "sales",
    steps: ["landing", "delivery"],
    productSlots: [
      {
        key: "magnet",
        label: "무료 자료 (전자책/체크리스트/템플릿)",
        placement: "sales",
        productType: "ebook",
        priceMode: "free",
        required: true,
      },
    ],
    disableGlobal: ["soap_opera", "watch_deadline"],
    pageOverrides: {
      landing: optinPage({
        topbar: "무료 자료 받기",
        eyebrow: "무료 다운로드",
        title: "이거 하나면\n한참 헤맬 시간을 아낍니다",
        subtitle: "이메일만 넣으면 바로 받아요.\n스팸 없음, 언제든 수신거부.",
        bullets: ["신청 즉시 다운로드", "실무에 바로 쓰는 형식", "3페이지 체크리스트부터 보세요"],
        submitLabel: "무료로 받기",
        note: "신청하면 다음 화면에서 바로 다운로드",
      }),
    },
    automations: [
      {
        key: "magnet_followup",
        name: "자료 전달 → 다음 사다리",
        trigger: "signup",
        stopOn: ["purchase"],
        steps: [
          {
            delayMinutes: 0,
            audience: "all",
            body: "{이름}님, 신청하신 자료 여기 있어요.\n📎 {다운로드링크}\n폰에서도 다시 보려면: {라이브러리링크}",
          },
          {
            delayMinutes: 1 * D,
            audience: "all",
            body: "{이름}님, 어제 받으신 자료 열어보셨어요? 3페이지 체크리스트부터 보시면 딱이에요.\n📎 {다운로드링크}",
          },
          {
            delayMinutes: 3 * D,
            audience: "all",
            body: "자료만으로 부족하셨다면, 같은 주제 무료 강의도 열어뒀어요.\n👉 {세일즈링크}",
          },
        ],
      },
    ],
    crmNote:
      "종착(세일즈)에는 '다음 계단' 상품(세미나·강의)을 연결해 크로스셀 하세요.",
  },

  /* ───────────────────────── 라이브 세미나 신청 ───────────────────────── */
  {
    key: "live_webinar",
    name: "라이브 세미나 신청 퍼널",
    tagline: "날짜 잡힌 라이브 — 참석 압박이 에버그린보다 강하다",
    icon: "🔴",
    ladder: "presentation",
    funnelType: "live_webinar_reg",
    terminalStep: "booking",
    steps: ["landing", "thankyou", "vod", "booking"],
    productSlots: [
      {
        key: "offer",
        label: "세미나 뒤 오퍼 상품 (선택)",
        placement: "sales",
        productType: "vod_course",
        priceMode: "paid",
        required: false,
      },
    ],
    disableGlobal: ["watch_deadline"],
    pageOverrides: {
      landing: optinPage({
        topbar: "라이브 세미나 무료 신청",
        eyebrow: "라이브 · 무료",
        title: "이번 한 번뿐입니다.\n실시간으로 질문하세요",
        subtitle: "녹화 강의로는 못 하는 Q&A.\n신청하면 일정·입장 링크를 보내드려요.",
        bullets: ["신청 후 일정·캘린더 안내", "시작 전 리마인더 자동 발송", "못 보면 리플레이 48시간 제공"],
        submitLabel: "무료 신청하기",
        note: "신청 후 일정 안내 문자가 갑니다",
      }),
      thankyou: {
        root: root,
        content: [
          { type: "Heading", props: { id: "h", eyebrow: "신청 완료", text: "일정을 캘린더에 넣어두세요", level: 1, align: "center" } },
          { type: "Countdown", props: { id: "cd", label: "라이브 시작까지", deadlineIso: "", expiredText: "곧 시작합니다" } },
          { type: "Text", props: { id: "t", text: "시작 직전에 입장 링크를 문자로 보내드려요.\n지금 캘린더에 등록하고, 그날 시간 비워두세요.", align: "center", style: "body" } },
          { type: "CTAButton", props: { id: "l", label: "라이브 입장 링크 (시작 후 활성)", sub: "", href: "{{live}}", variant: "primary" } },
          { type: "CTAButton", props: { id: "n", label: "지난 회차 리플레이 보기", sub: "라이브 종료 후 열림", href: "{{next}}", variant: "ghost" } },
        ],
      } as FunnelData,
    },
    automations: [
      {
        key: "live_replay",
        name: "라이브 종료 → 리플레이 안내",
        trigger: "event_registered",
        stopOn: [],
        steps: [
          {
            delayMinutes: 100,
            audience: "all",
            body: "{이름}님, 리플레이가 열렸어요. 놓친 부분 다시 보세요.\n📎 {링크}",
          },
          {
            delayMinutes: 100 + 45 * H,
            audience: "not_purchased",
            body: "{이름}님, 리플레이가 곧 닫혀요. 지금 마무리하세요.\n📎 {링크}",
          },
        ],
      },
    ],
    crmNote:
      "전날·1시간 전 리마인더는 자동입니다. 캠페인 설정에 회차(일시·유튜브 링크)를 꼭 등록하세요.",
  },

  /* ───────────────────────── VOD 강의 판매 ───────────────────────── */
  {
    key: "course_sale",
    name: "VOD 강의 판매 퍼널",
    tagline: "세일즈레터 → 결제 → 업셀 → 강의실",
    icon: "🎓",
    ladder: "frontend",
    funnelType: "vod_course",
    terminalStep: "course",
    steps: ["sales", "thankyou", "course"],
    productSlots: [
      {
        key: "course",
        label: "본 강의 (VOD 강의)",
        placement: "sales",
        productType: "vod_course",
        priceMode: "paid",
        required: true,
      },
      {
        key: "upsell",
        label: "업셀 상품 (심화/코칭 — 선택)",
        placement: "sales",
        productType: "coaching",
        priceMode: "paid",
        required: false,
      },
    ],
    automations: [
      {
        key: "course_onboard",
        name: "결제 후 완주 온보딩",
        trigger: "purchase",
        stopOn: [],
        steps: [
          { delayMinutes: 0, audience: "all", body: "{이름}님, 결제 완료! 강의실 바로 입장하세요.\n👉 {강의실링크}" },
          { delayMinutes: 1 * D, audience: "all", body: "Day 1 완료하셨어요? 첫 모듈만 끝내도 절반은 온 거예요.\n{강의실링크}" },
          { delayMinutes: 3 * D, audience: "all", body: "{이름}님, 3일째예요. 여기서 멈추는 분이 많은데 딱 10분만 더.\n{강의실링크}" },
          { delayMinutes: 7 * D, audience: "all", body: "완주 후기가 단톡방에 올라와요. {이름}님 차례입니다.\n{강의실링크}" },
          { delayMinutes: 10 * D, audience: "all", body: "강의 다 보셨으면 다음 단계 — {세일즈링크}" },
        ],
      },
    ],
    crmNote:
      "장바구니 이탈 복구는 전역 자동 메시지로 적용됩니다. 업셀은 상품의 원클릭 업셀 슬롯을 쓰세요.",
  },

  /* ───────────────────────── 멤버십 ───────────────────────── */
  {
    key: "membership",
    name: "멤버십 퍼널",
    tagline: "연속 수익 — 멤버십 하나면 비즈니스가 바뀐다",
    icon: "♾️",
    ladder: "continuity",
    funnelType: "vod_course",
    terminalStep: "course",
    steps: ["sales", "thankyou", "course"],
    productSlots: [
      {
        key: "membership",
        label: "멤버십 상품 (타입=멤버십, 무료 개월 설정)",
        placement: "sales",
        productType: "membership",
        priceMode: "paid",
        required: true,
      },
    ],
    automations: [
      {
        key: "membership_onboard",
        name: "멤버십 온보딩 + 첫 결제 안내",
        trigger: "purchase",
        stopOn: [],
        steps: [
          { delayMinutes: 0, audience: "all", body: "{이름}님, 멤버십 시작! 지금 볼 수 있는 것부터: {강의실링크}\n첫 결제 전이면 아무 때나 해지 가능해요." },
          { delayMinutes: 3 * D, audience: "all", body: "첫 주에 하나만 끝내도 본전. 이번 주 추천 강의 확인해 보세요.\n{강의실링크}" },
          { delayMinutes: 25 * D, audience: "all", body: "{이름}님, 곧 첫 결제가 진행돼요. 계속 이용하시면 아무것도 안 하셔도 됩니다. 해지는 보관함에서." },
        ],
      },
    ],
    crmNote:
      "회차 결제 실패(dunning) 안내는 결제 시스템이 자동 처리합니다. 상품에서 무료 개월 수를 꼭 설정하세요.",
  },
];

export function getTemplate(key: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.key === key);
}
