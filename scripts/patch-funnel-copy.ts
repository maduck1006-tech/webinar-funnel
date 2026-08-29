/**
 * 퍼널 전체 카피 교정 (1회성, 재실행 안전).
 *   npx tsx --env-file=.env.local scripts/patch-funnel-copy.ts
 *
 * - 포지셔닝 통일: "선착순" 제거, 무료시청 기간(48h)에 할인 소멸 스토리 일원화
 * - 히어로/고민/불릿을 '지식 상품화' 주제로 구체화
 * - 땡큐 페이지를 '바로 시청' 우선 구조로 재배치 (워크북은 그 아래)
 * - 예약 페이지에서 "고가 패키지 안내" 프레임 제거
 * campaign_pages(발행본) 대상. 블록 id/type 으로 매칭, 없으면 skip.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { campaignPages } from "../src/db/schema";

type Block = { type: string; props: Record<string, unknown> };
type PageData = { root?: { props?: Record<string, unknown> }; content?: Block[] };

const byId = (c: Block[], id: string) => c.find((b) => b.props?.id === id);
const byType = (c: Block[], t: string) => c.find((b) => b.type === t);

function patchLanding(d: PageData): boolean {
  const c = d.content;
  if (!Array.isArray(c)) return false;

  if (d.root?.props) {
    d.root.props.topbarText = "지식 상품화 3시간 무료 강의";
    d.root.props.topbarCtaLabel = "지금 바로 신청";
    d.root.props.topbarRushSeconds = 0;
    d.root.props.topbarDeadlineIso = "";
  }

  const hero = byType(c, "Hero");
  if (hero) {
    hero.props.eyebrow = "무료 강의 · 신청 즉시 시청";
    hero.props.title = "가진 경험을\n'팔리는 지식 상품'으로";
    hero.props.subtitle =
      "아이템 선정부터 첫 고객 계약까지,\n3시간이면 전체 그림이 잡힙니다.\n신청하면 다음 화면에서 바로 재생돼요.";
  }
  const h1 = byId(c, "h1");
  if (h1) {
    h1.props.eyebrow = "이런 고민, 있으셨죠";
    h1.props.text = "'나도 이걸로 강의할 수 있을까'\n생각만 하고 몇 달째라면";
  }
  const b1 = byId(c, "b1");
  if (b1) b1.props.text = '"내 경험이 상품이 될지 확신이 안 서요"';
  const b2 = byId(c, "b2");
  if (b2) b2.props.text = '"만들어도 어떻게 팔아야 할지 모르겠어요"';

  const list = byId(c, "list");
  if (list) {
    list.props.title = "이 강의에서 다루는 것";
    list.props.items = [
      { text: "팔리는 아이템을 고르는 기준" },
      { text: "그대로 따라 쓰는 상세페이지·상담 스크립트" },
      { text: "밀어붙이지 않고 계약까지 가는 상담법" },
    ];
  }
  const h2 = byId(c, "h2");
  if (h2) h2.props.eyebrow = "이메일만 입력하면 끝";

  for (const b of c) {
    if (b.type === "LeadForm") {
      b.props.note = "신청하면 다음 화면에서 바로 재생 · 48시간 무제한";
      b.props.submitLabel = "무료 강의 신청하기";
    }
  }
  return true;
}

function patchThankyou(d: PageData): boolean {
  const c = d.content;
  if (!Array.isArray(c)) return false;

  const h = byId(c, "h") ?? byType(c, "Heading");
  const t = byId(c, "t") ?? byType(c, "Text");
  const img = byId(c, "img") ?? byType(c, "Image");
  const price = byType(c, "Price");
  const primaryCta = c.find(
    (b) => b.type === "CTAButton" && String(b.props?.href).includes("checkout"),
  );
  const vodCta = c.find(
    (b) => b.type === "CTAButton" && b.props?.href === "/vod",
  );

  if (h) {
    h.props.eyebrow = "신청 완료";
    h.props.text = "강의가 준비됐어요";
  }
  if (t) {
    t.props.text =
      "아래 버튼을 누르면 바로 시청이 시작됩니다.\n문자로도 링크를 보내드렸어요. (48시간 무제한)";
  }
  if (price) {
    price.props.badge = "강의 신청자가";
    price.props.note = "무료 시청 기간(48시간) 동안만 이 가격이에요";
  }
  if (primaryCta) {
    primaryCta.props.label = "워크북 담기";
    primaryCta.props.sub = "즉시 다운로드";
    primaryCta.props.variant = "primary";
  }
  if (vodCta) {
    vodCta.props.label = "일단 강의부터 볼게요";
    vodCta.props.variant = "ghost";
  }

  // '강의 바로 보기' 우선 CTA + 워크북 소개 헤딩을 상단에 삽입 (중복 없으면)
  if (!byId(c, "watch")) {
    const insertAt = t ? c.indexOf(t) + 1 : 1;
    c.splice(
      insertAt,
      0,
      {
        type: "CTAButton",
        props: {
          id: "watch",
          label: "강의 바로 보기",
          sub: "지금 시작 · 48시간 무제한",
          href: "/vod",
          variant: "primary",
        },
      },
      {
        type: "Heading",
        props: {
          id: "h2offer",
          eyebrow: "",
          text: "보기 전에 30초,\n이것만 챙기세요",
          level: 3,
          align: "center",
        },
      },
    );
  }
  // img 앞에 워크북 설명 텍스트
  if (!byId(c, "t2") && img) {
    c.splice(c.indexOf(img), 0, {
      type: "Text",
      props: {
        id: "t2",
        text: "강의에 나오는 상세페이지·상담 스크립트를\n바로 쓸 수 있게 정리한 워크북입니다.\n직접 만들면 며칠 걸리는 분량이에요.",
        align: "center",
        style: "body",
      },
    });
  }
  return true;
}

function patchVod(d: PageData): boolean {
  const c = d.content;
  if (!Array.isArray(c)) return false;

  const cd = byType(c, "Countdown");
  if (cd) {
    cd.props.label = "무료 시청 마감까지";
    cd.props.expiredText = "무료 시청 기간이 종료되었습니다";
  }
  const bookCta = c.find(
    (b) => b.type === "CTAButton" && b.props?.href === "/booking",
  );
  if (bookCta) bookCta.props.sub = "결제 없이, 내 상황에 맞는 적용법 상담";

  const h = byType(c, "Heading");
  if (h) h.props.text = "강의에 나온 자료, 바로 쓰기";

  const price = byType(c, "Price");
  if (price) {
    price.props.badge = "강의 신청자가";
    price.props.note = "무료 시청 기간이 끝나면 정가로 돌아갑니다";
  }
  const wbCta = c.find(
    (b) => b.type === "CTAButton" && String(b.props?.href).includes("checkout"),
  );
  if (wbCta) {
    wbCta.props.label = "워크북 담기";
    wbCta.props.sub = "즉시 다운로드";
  }
  return true;
}

function patchBooking(d: PageData): boolean {
  const c = d.content;
  if (!Array.isArray(c)) return false;
  const h = byType(c, "Heading");
  if (h) {
    h.props.eyebrow = "다음 단계";
    h.props.text = "강의 내용을 내 상황에 맞게\n1:1로 점검받으세요";
  }
  const t = byType(c, "Text");
  if (t) {
    t.props.text =
      "30분 무료 화상 상담입니다.\n지금 하는 일이나 준비 중인 아이템에\n강의 내용을 어떻게 적용할지 같이 짚어드려요.\n아래에서 편한 시간을 선택하시면 됩니다.";
  }
  return true;
}

const PATCHERS: Record<string, (d: PageData) => boolean> = {
  landing: patchLanding,
  thankyou: patchThankyou,
  vod: patchVod,
  booking: patchBooking,
};

async function main() {
  const rows = await db
    .select()
    .from(campaignPages)
    .where(eq(campaignPages.published, true));
  let n = 0;
  for (const row of rows) {
    const fn = PATCHERS[row.pageType];
    if (!fn) continue;
    const data = row.data as PageData;
    if (fn(data)) {
      await db
        .update(campaignPages)
        .set({ data })
        .where(eq(campaignPages.id, row.id));
      n++;
      console.log(`patched: ${row.pageType} (campaign ${row.campaignId}, v${row.version}, ${row.variant})`);
    }
  }
  console.log(n === 0 ? "발행본 없음 — defaults.ts 만 반영" : `done: ${n} page(s)`);
}

main().then(() => process.exit(0));
