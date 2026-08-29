/**
 * P1 마이그레이션: 단일 퍼널 → 멀티 캠페인 (무중단, 재실행 안전)
 *
 *  1. 기본 캠페인(slug=main, is_default) 생성 — 없으면
 *  2. 템플릿 캠페인(slug=_template, is_template) 생성 — 없으면
 *  3. funnel_pages → campaign_pages (기본 캠페인) 이관, 없으면 defaults 로 4페이지 생성
 *  4. 템플릿 캠페인에도 defaults 4페이지
 *  5. products → campaign_products (기본 캠페인)
 *  6. leads / orders 의 campaign_id backfill
 *
 * 실행: npx tsx --env-file=.env.local scripts/migrate-to-campaigns.ts
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  campaignPages,
  campaignProducts,
  campaigns,
  funnelPages,
  leads,
  orders,
  products,
  type PageType,
} from "../src/db/schema";
import { defaultPages } from "../src/puck/defaults";

const PAGE_TYPES: PageType[] = ["landing", "thankyou", "vod", "booking"];
// funnel_pages.slug 값 → page_type (동일하지만 명시)
const SLUG_TO_TYPE: Record<string, PageType> = {
  landing: "landing",
  thankyou: "thankyou",
  vod: "vod",
  booking: "booking",
};

async function ensureCampaign(opts: {
  slug: string;
  name: string;
  isDefault?: boolean;
  isTemplate?: boolean;
  status?: "draft" | "live" | "archived";
}) {
  const [existing] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.slug, opts.slug));
  if (existing) return existing;
  const [created] = await db
    .insert(campaigns)
    .values({
      slug: opts.slug,
      name: opts.name,
      status: opts.status ?? "draft",
      isDefault: opts.isDefault ?? false,
      isTemplate: opts.isTemplate ?? false,
      vodSrc: process.env.NEXT_PUBLIC_VOD_SRC || null,
      vodWindowHours: Number(process.env.VOD_ACCESS_WINDOW_HOURS ?? 48),
      bookingEmbedUrl: process.env.NEXT_PUBLIC_WHATTIME_EMBED_URL || null,
    })
    .returning();
  console.log(`  + 캠페인 생성: ${opts.slug} (${created.id})`);
  return created;
}

async function seedPagesFromDefaults(campaignId: string) {
  for (const pt of PAGE_TYPES) {
    const has = await db
      .select({ n: sql<number>`count(*)` })
      .from(campaignPages)
      .where(
        and(
          eq(campaignPages.campaignId, campaignId),
          eq(campaignPages.pageType, pt),
        ),
      );
    if (Number(has[0].n) > 0) continue;
    await db.insert(campaignPages).values({
      campaignId,
      pageType: pt,
      version: 1,
      published: true,
      data: defaultPages[pt] as object,
    });
    console.log(`    · ${pt} <- defaults`);
  }
}

async function main() {
  console.log("마이그레이션 시작...");

  const main = await ensureCampaign({
    slug: "main",
    name: "기본 캠페인",
    isDefault: true,
    status: "live",
  });
  // is_default 보정 (다른 캠페인이 default 였다면 정리)
  await db
    .update(campaigns)
    .set({ isDefault: false })
    .where(sql`${campaigns.id} <> ${main.id}`);
  await db
    .update(campaigns)
    .set({ isDefault: true, status: "live" })
    .where(eq(campaigns.id, main.id));

  const template = await ensureCampaign({
    slug: "_template",
    name: "기본 템플릿",
    isTemplate: true,
    status: "draft",
  });

  // 3. funnel_pages → campaign_pages (기본 캠페인)
  const legacy = await db.select().from(funnelPages).catch(() => []);
  if (legacy.length > 0) {
    for (const row of legacy) {
      const pt = SLUG_TO_TYPE[row.slug];
      if (!pt) continue;
      const dup = await db
        .select({ n: sql<number>`count(*)` })
        .from(campaignPages)
        .where(
          and(
            eq(campaignPages.campaignId, main.id),
            eq(campaignPages.pageType, pt),
            eq(campaignPages.version, row.version),
          ),
        );
      if (Number(dup[0].n) > 0) continue;
      await db.insert(campaignPages).values({
        campaignId: main.id,
        pageType: pt,
        version: row.version,
        published: row.published,
        data: row.data as object,
        createdAt: row.createdAt,
      });
      console.log(`    · ${pt} v${row.version} <- funnel_pages`);
    }
  }
  // 빠진 page_type 은 defaults 로 채움
  await seedPagesFromDefaults(main.id);
  await seedPagesFromDefaults(template.id);

  // 5. products → campaign_products (기본 캠페인)
  const allProducts = await db.select().from(products);
  for (const p of allProducts) {
    const dup = await db
      .select({ n: sql<number>`count(*)` })
      .from(campaignProducts)
      .where(
        and(
          eq(campaignProducts.campaignId, main.id),
          eq(campaignProducts.productId, p.id),
        ),
      );
    if (Number(dup[0].n) > 0) continue;
    await db.insert(campaignProducts).values({
      campaignId: main.id,
      productId: p.id,
      placement: p.placement,
    });
  }
  console.log(`  · campaign_products: ${allProducts.length}개 연결`);

  // 6. backfill
  const l = await db
    .update(leads)
    .set({ campaignId: main.id })
    .where(isNull(leads.campaignId))
    .returning({ id: leads.id });
  const o = await db
    .update(orders)
    .set({ campaignId: main.id })
    .where(isNull(orders.campaignId))
    .returning({ id: orders.id });
  console.log(`  · leads backfill ${l.length} · orders backfill ${o.length}`);

  console.log("완료.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
