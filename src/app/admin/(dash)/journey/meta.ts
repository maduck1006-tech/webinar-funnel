/**
 * 고객 여정 지도 — 퍼널 단계 × 자동 발송 문자를 한 타임라인으로.
 * 클라이언트에서도 쓰므로 server-only 금지.
 */

export type JourneyKind = "message" | "urgent" | "success" | "admin";

export type JourneyStop = {
  /** automation_triggers.key / message_trigger enum 값 */
  triggerKey: string;
  /** 초등학생도 알아보는 이름 */
  title: string;
  /** 발송 시점 (사람이 읽는 말) */
  when: string;
  /** 이 손님이 어떤 상황일 때 */
  situation: string;
  /** 왜 나가나요 (조건) */
  why: string;
  kind: JourneyKind;
  /** 발송 시점 조정 가능 여부 (시간 오프셋) */
  offsetHours: number | null;
  /** 아직 인프라(enum/발화)가 없어 문구만 저장되는 트리거 */
  pendingInfra?: boolean;
  /** PDF 기획 기준 기본 문구 (seed 스크립트와 동일) */
  defaultTemplate: string;
};

export type JourneyAct = {
  num: string;
  title: string;
  sub: string;
  stops: JourneyStop[];
  /** 문자가 없는 구간의 안내 문구 */
  note?: string;
};

export const JOURNEY: JourneyAct[] = [
  {
    num: "①",
    title: "신청하자마자",
    sub: "손님이 랜딩에서 이름·연락처를 넣는 순간",
    stops: [
      {
        triggerKey: "signup_confirm",
        title: "신청 완료 · 시청 링크",
        when: "신청 즉시 · 0분",
        situation: "랜딩페이지에서 신청 → 땡큐페이지 도착. 바로 시청 링크를 받습니다.",
        why: "신청이 접수되면 무조건",
        kind: "message",
        offsetHours: null,
        defaultTemplate:
          "{이름}님, 🎉 신청하신 강의 시청 링크가 도착했습니다.\n{링크}\n\n해당 강의는 48시간 뒤 자동으로 비공개 전환됩니다.",
      },
    ],
  },
  {
    num: "②",
    title: "영상 보는 중, 워크북은 아직 안 삼",
    sub: "VOD에 들어왔지만 저가 상품(워크북)을 결제하지 않은 손님",
    stops: [
      {
        triggerKey: "pre_payment_nudge",
        title: "워크북 비밀 링크",
        when: "VOD 들어온 뒤 +30분",
        situation: "무료 VOD를 보는 중 · 워크북 미결제. 결제창을 닫았을 타이밍에 한 번 더.",
        why: "영상은 봤는데 결제는 안 했을 때",
        kind: "message",
        offsetHours: null,
        defaultTemplate:
          "앗 김영진입니다. 제공한 영상 보고 계시죠?\n영상 15분 구간부터 나오는 세팅 파트 보실 때 아까 보여드린 {상품명} 없으면 혼자 하시기 좀 빡세실 겁니다;;\n\n아까 결제창 그냥 닫으셔서 놓치신 것 같은데, 원래 한 번만 뜨는 결제 링크 하나 더 남길 테니 영상 보실 때 꼭 같이 띄워두고 보세요!\n👉 {결제링크}\n\n(혹시 창 닫으셨을까 봐 영상 링크도 같이 둡니다.)\n📎 {링크}",
      },
    ],
  },
  {
    num: "③",
    title: "마감이 다가올 때",
    sub: "워크북을 아직 안 산 손님 모두에게 (영상을 봤든 안 봤든). 마감이 가까울수록 세게.",
    stops: [
      {
        triggerKey: "reminder_24h",
        title: "절반 지남 알림",
        when: "신청 +24시간",
        situation: "워크북 미구매 · 시청 기한(48h) 안에 있는 손님",
        why: "신청 24시간 지남 · 미구매",
        kind: "message",
        offsetHours: 24,
        defaultTemplate:
          "어제 열어드린 무료 강의가 딱 24시간 남았습니다. 내일 봐야지 하고 미루시다 놓치는 분들이 많아서 퇴근 전에 톡 하나 남깁니다.\n\n지금 안 보시면 추가로 5만 원 가치의 {상품명} 특가 링크도 24시간 뒤 영상이랑 같이 닫힙니다. 오늘 밤에 무조건 챙겨보세요!\n📎 {링크}",
      },
      {
        triggerKey: "reminder_12h_left",
        title: "12시간 남음",
        when: "신청 +36시간",
        situation: "워크북 미구매 · 마감 12시간 전",
        why: "신청 36시간 지남 · 미구매",
        kind: "message",
        offsetHours: 36,
        defaultTemplate:
          "무료 강의 만료까지 이제 12시간 남았습니다. 다 보시고 막막하실까 봐 열어둔 5만 원 가치의 {상품명} 특가도 12시간 뒤면 완전 종료됩니다.\n\n나중에 다시 열어달라고 하셔도 안 열어드립니다 ㅠㅠ 후회하지 마시고 지금 당장 열어두세요.\n📎 {링크}",
      },
      {
        triggerKey: "reminder_1h_left",
        title: "마지막 1시간",
        when: "신청 +47시간 · 마지막 1시간",
        situation: "워크북 미구매 · 마감 직전. 가장 센 문구.",
        why: "신청 47시간 지남 · 미구매",
        kind: "urgent",
        offsetHours: 47,
        defaultTemplate:
          "진짜 닫힙니다. 무료 강의가 딱 1시간 남았습니다.\n\n영상 보실 때 최소 3배 아껴드리는 5만 원 가치의 {상품명}도 1시간 뒤면 원래 가격으로 돌아가고 링크가 사라집니다. 정 시간 없으시면 지금 들어와서 2배속으로라도 꼭 보세요!\n📎 {링크}",
      },
    ],
  },
  {
    num: "④",
    title: "결제한 뒤",
    sub: "워크북 결제 완료 → 구매자 VOD + 상담 예약 유도",
    note: "결제 완료 시 payment_success 문자가 자동 발송됩니다. (토스 서버 승인 시점)",
    stops: [],
  },
];

export const JOURNEY_STOPS: JourneyStop[] = JOURNEY.flatMap((a) => a.stops);

/* ────────────────────────────────────────────────────────────
   가로 2레인 보드 좌표 (PDF 흐름도 스타일) — 캔버스 1780 × 720
   ──────────────────────────────────────────────────────────── */

export type BoardPage = {
  id: string;
  tag: string;
  title: string;
  note?: string;
  x: number;
  y: number;
  w: number;
};

export const BOARD_PAGES: BoardPage[] = [
  { id: "p-ad", tag: "1단계", title: "광고", note: "OO주제 무료 강의", x: 20, y: 120, w: 140 },
  { id: "p-landing", tag: "2단계", title: "랜딩 · 신청", note: "이름·연락처 수집", x: 196, y: 110, w: 168 },
  { id: "p-thanks", tag: "3단계", title: "땡큐 + 저가상품", note: "강의 링크 발송 · 워크북 9,900원 제안", x: 400, y: 96, w: 216 },
  { id: "p-vod-no", tag: "4단계 · 미구매", title: "무료 VOD 시청 48h", note: "상단 카운트다운 · 하단 상담 CTA 고정", x: 676, y: 92, w: 186 },
  { id: "p-vod-yes", tag: "4단계 · 구매", title: "구매자 VOD 48h", note: "워크북 + 상담 예약 유도", x: 676, y: 214, w: 186 },
  { id: "p-book", tag: "5단계", title: "상담 예약", note: "되는시간 API", x: 924, y: 120, w: 158 },
  { id: "p-sales", tag: "6단계", title: "1:1 세일즈 상담", x: 1120, y: 120, w: 150 },
  { id: "p-close", tag: "클로징", title: "고가 코칭 제안", note: "사전 진단 기반 100만원+ 솔루션", x: 1308, y: 112, w: 170 },
];

/** 위 레인에서 좌→우로 잇는 페이지 순서 */
export const BOARD_SEQ = [
  "p-ad", "p-landing", "p-thanks", "p-vod-no", "p-book", "p-sales", "p-close",
];

export const BOARD_TIMER = { x: 404, y: 250, w: 150 };

export type BoardMsg = {
  triggerKey: string;
  /** 트리거 출처 (BOARD_PAGES id 또는 "timer") */
  from: string;
  x: number;
  y: number;
};

export const BOARD_MSGS: BoardMsg[] = [
  { triggerKey: "signup_confirm", from: "p-landing", x: 196, y: 430 },
  { triggerKey: "reminder_24h", from: "timer", x: 196, y: 548 },
  { triggerKey: "reminder_12h_left", from: "timer", x: 430, y: 548 },
  { triggerKey: "reminder_1h_left", from: "timer", x: 664, y: 548 },
  { triggerKey: "pre_payment_nudge", from: "p-vod-no", x: 690, y: 430 },
];

/** 문자가 아닌 안내 카드 (외부 시스템이 처리하는 구간 표시) */
export const BOARD_NOTES: { text: string; from: string; x: number; y: number; w: number }[] = [
  {
    text: "결제 완료 시 payment_success 문자 자동 발송",
    from: "p-vod-yes",
    x: 1000,
    y: 440,
    w: 260,
  },
];

export const BOARD_MSG_W = 210;
export const BOARD_W = 1780;
export const BOARD_H = 720;

/** { } 변수 설명 */
export const VAR_KEY: { name: string; desc: string; pending?: boolean }[] = [
  { name: "{이름}", desc: "신청자 이름 (없으면 \"회원\")" },
  { name: "{링크}", desc: "이 손님의 VOD 시청 링크" },
  { name: "{예약링크}", desc: "1:1 상담 예약 페이지 링크" },
  { name: "{결제링크}", desc: "저가 상품 결제창(/checkout) 링크 (활성 상품 없으면 시청 링크로 대체)" },
  { name: "{상품명}", desc: "연결된 저가 상품 이름" },
  { name: "{다운로드링크}", desc: "워크북 파일 다운로드 링크 (캠페인 설정에서 URL 입력, 없으면 시청 링크로 대체)" },
  { name: "{마감시각}", desc: "이 손님의 시청 마감 일시" },
];
