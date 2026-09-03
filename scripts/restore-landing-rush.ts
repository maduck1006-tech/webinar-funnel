/**
 * 랜딩 상단바 10초 러시 게이지 복원. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/restore-landing-rush.ts [rushSeconds]
 *
 * b751875 "카피 교정" 커밋의 patch-funnel-copy.ts 가 topbarRushSeconds=0 으로
 * 꺼버린 것을 되돌린다. 상단바 문구/버튼은 건드리지 않고 게이지만 켠다.
 * 발행된 campaign_pages(pageType=landing) 대상.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { campaignPages } from "../src/db/schema";

const rushSeconds = Number(process.argv[2] ?? 10);

type PageData = { root?: { props?: Record<string, unknown> } };

async function main() {
  const rows = await db
    .select()
    .from(campaignPages)
    .where(eq(campaignPages.published, true));

  let n = 0;
  for (const row of rows) {
    if (row.pageType !== "landing") continue;
    const data = row.data as PageData;
    if (!data.root?.props) continue;

    data.root.props.topbarRushSeconds = rushSeconds;
    if (rushSeconds > 0) data.root.props.topbarDeadlineIso = "";

    await db
      .update(campaignPages)
      .set({ data })
      .where(eq(campaignPages.id, row.id));
    n++;
    console.log(
      `patched: campaign ${row.campaignId} v${row.version} ${row.variant} → rushSeconds ${rushSeconds}`,
    );
  }
  console.log(n === 0 ? "발행된 landing 없음" : `done: ${n} page(s)`);
}

main().then(() => process.exit(0));
