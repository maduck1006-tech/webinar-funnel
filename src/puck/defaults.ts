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
      topbarText: "지식 상품화 3시간 무료 강의",
      topbarCtaLabel: "지금 바로 신청",
      topbarRushSeconds: 0,
    }),
    content: [
      {
        type: "Hero",
        props: {
          id: "hero",
          image: "",
          eyebrow: "무료 강의 · 신청 즉시 시청",
          title: "가진 경험을\n'팔리는 지식 상품'으로",
          subtitle:
            "아이템 선정부터 첫 고객 계약까지,\n3시간이면 전체 그림이 잡힙니다.\n신청하면 다음 화면에서 바로 재생돼요.",
          height: "tall",
        },
      },
      {
        type: "Heading",
        props: {
          id: "h1",
          eyebrow: "이런 고민, 있으셨죠",
          text: "'나도 이걸로 강의할 수 있을까'\n생각만 하고 몇 달째라면",
          level: 2,
          align: "center",
        },
      },
      { type: "Text", props: { id: "b1", text: "\"내 경험이 상품이 될지 확신이 안 서요\"", align: "center", style: "bubble" } },
      { type: "Text", props: { id: "b2", text: "\"만들어도 어떻게 팔아야 할지 모르겠어요\"", align: "center", style: "bubble" } },
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
            { text: "팔리는 아이템을 고르는 기준" },
            { text: "그대로 따라 쓰는 상세페이지·상담 스크립트" },
            { text: "밀어붙이지 않고 계약까지 가는 상담법" },
          ],
        },
      },
      {
        type: "Bullets",
        props: {
          id: "how",
          title: "신청하면 이렇게 진행돼요",
          items: [
            { text: "이메일 입력하고 무료 신청 (10초)" },
            { text: "다음 화면에서 강의 즉시 재생 — 대기·승인 없음" },
            { text: "48시간 동안 무제한 반복 시청" },
          ],
        },
      },
      {
        type: "Heading",
        props: { id: "h2", eyebrow: "이메일만 입력하면 끝", text: "지금 무료로 신청하세요", level: 2, align: "center" },
      },
      {
        type: "LeadForm",
        props: {
          id: "form",
          headline: "",
          submitLabel: "무료 강의 신청하기",
          note: "신청하면 다음 화면에서 바로 재생 · 48시간 무제한",
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
        props: { id: "h", eyebrow: "신청 완료", text: "강의가 준비됐어요", level: 1, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t",
          text: "아래 버튼을 누르면 바로 시청이 시작됩니다.\n문자로도 링크를 보내드렸어요. (48시간 무제한)",
          align: "center",
          style: "body",
        },
      },
      {
        type: "CTAButton",
        props: { id: "watch", label: "강의 바로 보기", sub: "지금 시작 · 48시간 무제한", href: "/vod", variant: "primary" },
      },
      {
        type: "Heading",
        props: { id: "h2", eyebrow: "", text: "보기 전에 30초,\n이것만 챙기세요", level: 3, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t2",
          text: "강의에 나오는 상세페이지·상담 스크립트를\n바로 쓸 수 있게 정리한 워크북입니다.\n직접 만들면 며칠 걸리는 분량이에요.",
          align: "center",
          style: "body",
        },
      },
      { type: "Image", props: { id: "img", image: "", alt: "워크북 구성", fullBleed: true, ratio: "wide" } },
      {
        type: "Price",
        props: { id: "p", badge: "강의 신청자가", compareAt: 0, price: 0, note: "무료 시청 기간(48시간) 동안만 이 가격이에요" },
      },
      {
        type: "CTAButton",
        props: { id: "c", label: "워크북 담기", sub: "즉시 다운로드", href: "{{checkout}}", variant: "primary" },
      },
      {
        type: "CTAButton",
        props: { id: "s", label: "일단 강의부터 볼게요", sub: "", href: "/vod", variant: "ghost" },
      },
    ],
  },

  vod: {
    root: root(),
    content: [
      {
        type: "Countdown",
        props: { id: "cd", label: "무료 시청 마감까지", deadlineIso: "", expiredText: "무료 시청 기간이 종료되었습니다" },
      },
      { type: "Video", props: { id: "v", src: "", poster: "" } },
      {
        type: "CTAButton",
        props: { id: "b", label: "다음 단계로 →", sub: "강의를 다 봤다면 여기서 이어집니다", href: "{{terminal}}", variant: "primary" },
      },
      {
        type: "Heading",
        props: { id: "h", eyebrow: "", text: "강의에 나온 자료, 바로 쓰기", level: 3, align: "left" },
      },
      {
        type: "Price",
        props: { id: "p", badge: "강의 신청자가", compareAt: 0, price: 0, note: "무료 시청 기간이 끝나면 정가로 돌아갑니다" },
      },
      { type: "CTAButton", props: { id: "c", label: "워크북 담기", sub: "즉시 다운로드", href: "{{checkout}}", variant: "ghost" } },
    ],
  },

  booking: {
    root: root(),
    content: [
      {
        type: "Heading",
        props: { id: "h", eyebrow: "다음 단계", text: "강의 내용을 내 상황에 맞게\n1:1로 점검받으세요", level: 1, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t",
          text: "30분 무료 화상 상담입니다.\n지금 하는 일이나 준비 중인 아이템에\n강의 내용을 어떻게 적용할지 같이 짚어드려요.\n아래에서 편한 시간을 선택하시면 됩니다.",
          align: "center",
          style: "body",
        },
      },
    ],
  },

  groupchat: {
    root: root(),
    content: [
      {
        type: "Heading",
        props: { id: "h", eyebrow: "다음 단계", text: "무료 단톡방에서\n계속 이어집니다", level: 1, align: "center" },
      },
      {
        type: "Text",
        props: {
          id: "t",
          text: "강의를 끝까지 본 분들만 들어오는 단톡방이에요.\n실전 적용 질문, 사례 공유, 추가 자료가 여기서 오갑니다.\n아래 버튼으로 입장 신청하시면 곧 방장이 수락합니다.",
          align: "center",
          style: "body",
        },
      },
      {
        type: "CTAButton",
        props: { id: "join", label: "단톡방 입장하기", sub: "무료 · 강의 신청자 전용", href: "{{groupchat}}", variant: "primary" },
      },
      {
        type: "Text",
        props: {
          id: "t2",
          text: "입장이 안 되면 문자로 보내드린 링크를 다시 확인해 주세요.",
          align: "center",
          style: "body",
        },
      },
    ],
  },
};
