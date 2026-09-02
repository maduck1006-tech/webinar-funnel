/**
 * campaign_products 에 범프/업셀/다운셀 컬럼 추가 + products 값 이관. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/ddl-campaign-product-offers.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.unsafe(`
    ALTER TABLE campaign_products
      ADD COLUMN IF NOT EXISTS bump_product_id uuid,
      ADD COLUMN IF NOT EXISTS bump_description text,
      ADD COLUMN IF NOT EXISTS upsell_product_id uuid,
      ADD COLUMN IF NOT EXISTS downsell_product_id uuid
  `);

  // 기존 products.* → 이 상품이 연결된 모든 campaign_products 로 복사 (아직 안 채워진 것만)
  const res = await sql.unsafe(`
    UPDATE campaign_products cp
    SET bump_product_id    = COALESCE(cp.bump_product_id, p.bump_product_id),
        bump_description    = COALESCE(cp.bump_description, p.bump_description),
        upsell_product_id   = COALESCE(cp.upsell_product_id, p.upsell_product_id),
        downsell_product_id = COALESCE(cp.downsell_product_id, p.downsell_product_id)
    FROM products p
    WHERE p.id = cp.product_id
      AND (p.bump_product_id IS NOT NULL
        OR p.upsell_product_id IS NOT NULL
        OR p.downsell_product_id IS NOT NULL)
  `);

  console.log("✅ 컬럼 추가 + 이관 완료. 갱신된 매핑:", res.count);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
