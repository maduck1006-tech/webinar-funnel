/**
 * 발행된 landing 페이지에 "신청 즉시 시청" 메시지를 주입한다. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/patch-landing-instant-access.ts
 *
 * - Hero eyebrow / subtitle 를 즉시성 문구로 교체
 * - 최종 신청 Heading 앞에 "신청하면 이렇게 진행돼요" Bullets(id: how) 삽입
 * - 신청 Heading eyebrow + LeadForm note 를 즉시성 문구로 교체
 * campaign_pages(발행본) 우선, 없으면 funnel_pages(레거시) 도 시도.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { campaignPages, funnelPages } from "../src/db/schema";

type Block = { type: string; props: Record<string, unknown> };
type PageData = {
  root?: { props?: Record<string, unknown> };
  content?: Block[];
};

const HERO_EYEBROW = "무료 웨비나 · 신청 즉시 시청 가능";
const HERO_SUBTITLE = "광고에서 약속한 그 내용,\n신청하면 다음 화면에서 바로 재생됩니다.";
const FORM_HEADING_EYEBROW = "이메일 인증·대기 없음";
const FORM_NOTE = "신청하면 다음 화면에서 바로 재생 · 48시간 무제한";

const howBlock: Block = {
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
};

/** data 를 in-place 로 수정. 변경이 있으면 true */
function patch(data: PageData): boolean {
  const content = data.content;
  if (!Array.isArray(content)) return false;
  let changed = false;

  const hero = content.find((b) => b.type === "Hero");
  if (hero) {
    if (hero.props.eyebrow !== HERO_EYEBROW) {
      hero.props.eyebrow = HERO_EYEBROW;
      changed = true;
    }
    if (hero.props.subtitle !== HERO_SUBTITLE) {
      hero.props.subtitle = HERO_SUBTITLE;
      changed = true;
    }
  }

  // 모든 LeadForm note 를 즉시성 문구로
  for (const b of content) {
    if (b.type === "LeadForm" && b.props.note !== FORM_NOTE) {
      b.props.note = FORM_NOTE;
      changed = true;
    }
  }

  // 마지막 LeadForm 직전 Heading + how 블록 삽입 기준점
  const formIdx = content.map((b) => b.type).lastIndexOf("LeadForm");
  if (formIdx !== -1) {

    // 직전 Heading eyebrow
    for (let i = formIdx - 1; i >= 0; i--) {
      if (content[i].type === "Heading") {
        if (content[i].props.eyebrow !== FORM_HEADING_EYEBROW) {
          content[i].props.eyebrow = FORM_HEADING_EYEBROW;
          changed = true;
        }
        break;
      }
    }

    // how 블록 삽입 (없을 때만) — 신청 Heading(있으면) 앞, 아니면 LeadForm 앞
    const hasHow = content.some(
      (b) => b.type === "Bullets" && b.props.id === "how",
    );
    if (!hasHow) {
      let insertAt = formIdx;
      for (let i = formIdx - 1; i >= 0; i--) {
        if (content[i].type === "Heading") {
          insertAt = i;
          break;
        }
      }
      content.splice(insertAt, 0, JSON.parse(JSON.stringify(howBlock)));
      changed = true;
    }
  }

  return changed;
}

async function main() {
  let touched = 0;

  const camp = await db
    .select()
    .from(campaignPages)
    .where(and(eq(campaignPages.pageType, "landing"), eq(campaignPages.published, true)));

  for (const row of camp) {
    const data = row.data as PageData;
    if (patch(data)) {
      await db
        .update(campaignPages)
        .set({ data })
        .where(eq(campaignPages.id, row.id));
      touched++;
      console.log(`campaign_pages: ${row.id} (campaign ${row.campaignId}, v${row.version}, ${row.variant}) patched`);
    }
  }

  // 레거시 테이블도 (아직 서빙 중일 수 있음)
  try {
    const legacy = await db
      .select()
      .from(funnelPages)
      .where(and(eq(funnelPages.slug, "landing"), eq(funnelPages.published, true)));
    for (const row of legacy) {
      const data = row.data as PageData;
      if (patch(data)) {
        await db
          .update(funnelPages)
          .set({ data })
          .where(and(eq(funnelPages.slug, row.slug), eq(funnelPages.version, row.version)));
        touched++;
        console.log(`funnel_pages: ${row.slug} v${row.version} patched`);
      }
    }
  } catch {
    /* 레거시 테이블 없음 */
  }

  console.log(
    touched === 0
      ? "발행된 landing row 없음 — defaults.ts 만 반영됨 (배포로 적용)"
      : `done: ${touched} row(s) patched`,
  );
}

main().then(() => process.exit(0));
