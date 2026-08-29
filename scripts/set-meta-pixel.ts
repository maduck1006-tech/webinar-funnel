/**
 * 모든 비-템플릿 캠페인에 Meta 픽셀 ID 설정. 재실행 안전.
 *   npx tsx --env-file=.env.local scripts/set-meta-pixel.ts <pixelId>
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { campaigns } from "../src/db/schema";

async function main() {
  const pixel = process.argv[2];
  if (!pixel || !/^\d{6,20}$/.test(pixel)) {
    console.error("사용법: tsx scripts/set-meta-pixel.ts <숫자 픽셀ID>");
    process.exit(1);
  }

  const rows = await db.select().from(campaigns);
  console.table(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      template: r.isTemplate,
      status: r.status,
      before: r.metaPixelId,
    })),
  );

  const targets = rows.filter((r) => !r.isTemplate);
  for (const c of targets) {
    await db
      .update(campaigns)
      .set({ metaPixelId: pixel, updatedAt: new Date() })
      .where(eq(campaigns.id, c.id));
    console.log(`  ✓ ${c.slug} → ${pixel}`);
  }
  console.log(`\n완료: ${targets.length}개 캠페인`);
  process.exit(0);
}

main();
