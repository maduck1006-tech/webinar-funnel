import type { Data } from "@puckeditor/core";
import type { FunnelProps, RootProps } from "./config";

export type FunnelData = Data<FunnelProps, RootProps>;

const root = (over: Partial<RootProps> = {}) => ({
  props: {
    theme: "dark" as const,
    topbarText: "",
    topbarCtaLabel: "",
    topbarCtaHref: "#apply",
    topbarDeadlineIso: "",
    topbarRushSeconds: 0,
    ...over,
  },
});

/** 관리자 빌더로 편집하기 전까지 사용하는 기본 페이지 구성 (국내 웨비나 랜딩 스타일) */
export const defaultPages: Record<string, FunnelData> = {
  landing: {
    root: root({
      topbarText: "선착순 마감 임박!",
      topbarCtaLabel: "지금 신청하기",
      topbarRushSeconds: 10,
    }),
    content: [
      {
        type: "Hero",
        props: {
          id: "hero",
          image: "",
          eyebrow: "무료 온라인 웨비나",
          title: "3시간이면 이해되는\n실전 강의",
          subtitle: "광고에서 약속한 그 내용,\n신청 즉시 바로 확인하실 수 있습니다.",
          height: "tall",
        },
      },
      {
        type: "Heading",
        props: {
          id: "h1",
          eyebrow: "이런 고민 있으셨나요",
          text: "혼자 부딪히며\n시간 낭비하고 계신다면",
          level: 2,
          align: "center",
        },
      },
      { type: "Text", props: { id: "b1", text: "\"뭘 먼저 해야 할지 모르겠어요\"", align: "center", style: "bubble" } },
      { type: "Text", props: { id: "b2", text: "\"강의는 많이 봤는데 적용이 안 돼요\"", align: "center", style: "bubble" } },
      {
        type: "Image",
        props: { id: "img1", image: "", alt: "강의 미리보기", fullBleed: true, ratio: "wide" },
      },
      {
        type: "Bullets",
        props: {
          id: "list",
          title: "이 강의에서 다루는 것",
          items: [
            { text: "고객 발굴부터 클로징까지 전체 흐름" },
            { text: "바로 쓰는 제안서 / 스크립트 템플릿" },
            { text: "관계 구축형 세일즈 실전 전략" },
          ],
        },
      },
      {
        type: "Heading",
        props: { id: "h2", eyebrow: "", text: "지금 무료로 신청하세요", level: 2, align: "center" },
      },
      {
        type: "LeadForm",
        props: {
          id: "form",
          headline: "",
          submitLabel: "무료 강의 신청하기",
          note: "10초면 신청 완료 · 스팸 없음",
          nextPath: "/thankyou",
          sticky: true,
        },
      },
    ],
  },

  thankyou: {
    root: root(),
    content: [
      {
        type: "Heading",
        props: { id: "h", eyebrow: "신청 완료", text: "강의 링크가\n발송되었습니다", level: 1, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t",
          text: "강의 내용을 200% 바로 적용할 수 있는\n핵심 워크북을 지금 이 화면에서만\n특별가로 받아가세요.",
          align: "center",
          style: "body",
        },
      },
      { type: "Image", props: { id: "img", image: "", alt: "워크북 구성", fullBleed: true, ratio: "wide" } },
      {
        type: "Price",
        props: { id: "p", badge: "한정가", compareAt: 0, price: 0, note: "이 페이지를 벗어나면 정가로 돌아갑니다" },
      },
      {
        type: "CTAButton",
        props: { id: "c", label: "지금 특별가로 받기", sub: "카드 간편결제 · 즉시 지급", href: "{{checkout}}", variant: "primary" },
      },
      {
        type: "CTAButton",
        props: { id: "s", label: "괜찮아요, 무료 강의 먼저 볼게요", sub: "", href: "/vod", variant: "ghost" },
      },
    ],
  },

  vod: {
    root: root(),
    content: [
      {
        type: "Countdown",
        props: { id: "cd", label: "시청 마감까지", deadlineIso: "", expiredText: "시청 기간이 종료되었습니다" },
      },
      { type: "Video", props: { id: "v", src: "", poster: "" } },
      {
        type: "CTAButton",
        props: { id: "b", label: "1:1 무료 상담 예약하기", sub: "결제 없이 바로 예약", href: "/booking", variant: "primary" },
      },
      {
        type: "Heading",
        props: { id: "h", eyebrow: "", text: "강의와 함께 보면 좋은 자료", level: 3, align: "left" },
      },
      {
        type: "Price",
        props: { id: "p", badge: "시청자 한정", compareAt: 0, price: 0, note: "강의를 보는 지금이 가장 저렴합니다" },
      },
      { type: "CTAButton", props: { id: "c", label: "워크북 받기", sub: "", href: "{{checkout}}", variant: "ghost" } },
    ],
  },

  booking: {
    root: root(),
    content: [
      {
        type: "Heading",
        props: { id: "h", eyebrow: "다음 단계", text: "1:1 무료 상담을\n예약하세요", level: 1, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t",
          text: "지금 신청하시는 분께만 시간 한정으로\n고가 패키지 안내를 드립니다.\n아래에서 편한 시간을 선택해 주세요.",
          align: "center",
          style: "body",
        },
      },
    ],
  },
};
