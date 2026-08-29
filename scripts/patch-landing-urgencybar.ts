/**
 * 발행된 landing 페이지 root 에 긴급성 상단바 설정을 채운다. (1회성)
 *   npx tsx --env-file=.env.local scripts/patch-landing-urgencybar.ts [rushSeconds]
 * rushSeconds 기본 10 (>0: 빠르게 감소 연출, 실제 마감 안 됨). 0 이면 topbarDeadlineIso 사용.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { funnelPages } from "../src/db/schema";

const rushSeconds = Number(process.argv[2] ?? 10);

async function main() {
  const rows = await db
    .select()
    .from(funnelPages)
    .where(and(eq(funnelPages.slug, "landing"), eq(funnelPages.published, true)));

  if (rows.length === 0) {
    console.log("발행된 landing row 없음 — defaults.ts 사용 (이미 반영됨)");
    return;
  }

  for (const row of rows) {
    const data = row.data as { root?: { props?: Record<string, unknown> } };
    data.root ??= {};
    data.root.props ??= {};
    data.root.props.topbarText = "선착순 마감 임박!";
    data.root.props.topbarCtaLabel = "지금 신청하기";
    data.root.props.topbarCtaHref = "#apply";
    data.root.props.topbarRushSeconds = rushSeconds;
    if (rushSeconds > 0) data.root.props.topbarDeadlineIso = "";

    await db
      .update(funnelPages)
      .set({ data })
      .where(
        and(eq(funnelPages.slug, row.slug), eq(funnelPages.version, row.version)),
      );
    console.log(`patched: ${row.slug} v${row.version} → rushSeconds ${rushSeconds}`);
  }
}

main().then(() => process.exit(0));
