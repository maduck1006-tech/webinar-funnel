/**
 * 발행된 퍼널 페이지의 LeadForm 블록에 sticky=true 를 채워 넣는다.
 * (defaults.ts 변경은 이미 발행된 DB row 에는 반영되지 않으므로 1회성 패치)
 *   npx tsx --env-file=.env.local scripts/enable-sticky-leadform.ts
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { funnelPages } from "../src/db/schema";

async function main() {
  const rows = await db
    .select()
    .from(funnelPages)
    .where(eq(funnelPages.published, true));

  if (rows.length === 0) {
    console.log("발행된 funnel_pages row 없음 — defaults.ts 가 사용됨 (이미 sticky:true)");
    return;
  }

  for (const row of rows) {
    const data = row.data as {
      content?: { type: string; props: Record<string, unknown> }[];
    };
    // 여러 LeadForm 이 있으면 마지막 것만 sticky (하단 고정 CTA 바 중복 방지)
    const forms = (data.content ?? []).filter((b) => b.type === "LeadForm");
    let changed = false;
    forms.forEach((block, i) => {
      const want = i === forms.length - 1;
      if (block.props.sticky !== want) {
        block.props.sticky = want;
        changed = true;
      }
    });
    if (changed) {
      await db
        .update(funnelPages)
        .set({ data })
        .where(
          and(eq(funnelPages.slug, row.slug), eq(funnelPages.version, row.version)),
        );
      console.log(`patched: ${row.slug} v${row.version}`);
    } else {
      console.log(`skip (LeadForm 없음/이미 적용): ${row.slug} v${row.version}`);
    }
  }
}

main().then(() => process.exit(0));
