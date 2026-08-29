/**
 * 발행된 landing 페이지 맨 위에 "상단 배너" 이미지 블록을 넣는다. 재실행 안전.
 *   npx tsx --env-file=.env.local scripts/patch-landing-banner.ts "<배너이미지 URL>" [campaignSlug]
 *
 * - 첫 블록이 id="topbanner" 인 Image 면 URL 만 갱신, 아니면 맨 앞에 삽입
 * - 배너에 문구가 이미 그려져 있으므로, 바로 아래 텍스트 Hero 의 title/subtitle 은 비운다
 *   (eyebrow 는 유지 — 필요없으면 관리자 빌더에서 삭제)
 * - campaignSlug 생략 시 기본 캠페인(is_default)
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { campaignPages, campaigns } from "../src/db/schema";

type Block = { type: string; props: Record<string, unknown> };
type PageData = { root?: unknown; content?: Block[] };

async function main() {
  const url = process.argv[2];
  const slug = process.argv[3];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error(
      '사용법: tsx scripts/patch-landing-banner.ts "https://.../banner.png" [campaignSlug]',
    );
    process.exit(1);
  }

  const [campaign] = slug
    ? await db.select().from(campaigns).where(eq(campaigns.slug, slug))
    : await db.select().from(campaigns).where(eq(campaigns.isDefault, true));
  if (!campaign) {
    console.error("캠페인을 찾을 수 없음");
    process.exit(1);
  }

  const [page] = await db
    .select()
    .from(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, campaign.id),
        eq(campaignPages.pageType, "landing"),
        eq(campaignPages.published, true),
      ),
    );
  if (!page) {
    console.error("발행된 landing 페이지 없음");
    process.exit(1);
  }

  const data = page.data as PageData;
  const content = Array.isArray(data.content) ? data.content : [];

  const bannerBlock: Block = {
    type: "Image",
    props: {
      id: "topbanner",
      image: url,
      alt: campaign.name,
      fullBleed: true,
      flushTop: true,
      ratio: "auto",
    },
  };

  const first = content[0];
  if (first?.type === "Image" && first.props?.id === "topbanner") {
    first.props.image = url;
    first.props.flushTop = true;
    console.log("기존 상단 배너 URL 갱신");
  } else {
    content.unshift(bannerBlock);
    console.log("상단 배너 블록 삽입");
  }

  const hero = content.find((b) => b.type === "Hero");
  if (hero) {
    hero.props.title = "";
    hero.props.subtitle = "";
    hero.props.image = "";
    console.log("텍스트 Hero title/subtitle 비움 (배너와 중복 방지)");
  }

  data.content = content;
  await db
    .update(campaignPages)
    .set({ data })
    .where(eq(campaignPages.id, page.id));

  console.log(`\n완료: ${campaign.slug} landing → 배너 ${url}`);
  process.exit(0);
}

main();
