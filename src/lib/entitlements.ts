import "server-only";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { entitlements, products, type Product } from "@/db/schema";

/** 상품 타입 → 엔타이틀먼트 kind */
export function entitlementKind(type: string): string {
  switch (type) {
    case "vod_course":
      return "course";
    case "coaching":
      return "coaching";
    case "membership":
      return "membership";
    default:
      // workbook / ebook 등 다운로드성
      return "ebook";
  }
}

/**
 * 리드에게 상품 접근 권한 부여 (재실행 안전 — unique(lead_id, product_id)).
 * 이미 있으면 status='active' 로 되살리고 만료일 갱신.
 */
export async function grantEntitlement(opts: {
  leadId: string;
  productId: string;
  sourceOrderId?: string | null;
  product?: Pick<Product, "type" | "accessDays">;
}): Promise<void> {
  const { leadId, productId, sourceOrderId } = opts;

  let p = opts.product;
  if (!p) {
    const [row] = await db
      .select({ type: products.type, accessDays: products.accessDays })
      .from(products)
      .where(eq(products.id, productId));
    if (!row) return;
    p = row;
  }

  const kind = entitlementKind(p.type);
  const expiresAt = p.accessDays
    ? new Date(Date.now() + p.accessDays * 86_400_000)
    : null;

  await db
    .insert(entitlements)
    .values({
      leadId,
      productId,
      sourceOrderId: sourceOrderId ?? null,
      kind,
      status: "active",
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [entitlements.leadId, entitlements.productId],
      set: {
        status: "active",
        expiresAt,
        sourceOrderId: sourceOrderId ?? null,
        grantedAt: new Date(),
      },
    });
}

/** 리드의 이 상품 엔타이틀먼트 행(유효한 것만). 없으면 null */
export async function getEntitlement(
  leadId: string,
  productId: string,
): Promise<typeof entitlements.$inferSelect | null> {
  const now = new Date();
  const [row] = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.leadId, leadId),
        eq(entitlements.productId, productId),
        eq(entitlements.status, "active"),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** 리드가 이 상품에 유효한 접근 권한이 있는지 */
export async function hasEntitlement(
  leadId: string,
  productId: string,
): Promise<boolean> {
  return (await getEntitlement(leadId, productId)) !== null;
}

/** 리드가 보유한 모든 활성 엔타이틀먼트 (+ 상품 정보) — /library, CRM 탭 */
export async function listEntitlements(leadId: string) {
  return db
    .select({
      id: entitlements.id,
      kind: entitlements.kind,
      status: entitlements.status,
      grantedAt: entitlements.grantedAt,
      expiresAt: entitlements.expiresAt,
      productId: products.id,
      productName: products.name,
      productType: products.type,
    })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .where(eq(entitlements.leadId, leadId))
    .orderBy(desc(entitlements.grantedAt));
}
