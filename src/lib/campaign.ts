import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignPages,
  campaignSlugRedirects,
  campaigns,
  type Campaign,
  type PageType,
} from "@/db/schema";
import { defaultPages, type FunnelData } from "@/puck/defaults";

/** slug 로 못 쓰는 최상위 경로 (라우팅 충돌 방지) */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "preview",
  "thankyou",
  "vod",
  "booking",
  "community",
  "sales",
  "download",
  "course",
  "login",
  "library",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export function isValidSlug(slug: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) &&
    !RESERVED_SLUGS.has(slug);
}

/** 기본 캠페인 (`/` 및 무접두 경로가 가리키는 대상) */
export async function getDefaultCampaign(): Promise<Campaign | null> {
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.isDefault, true))
      .limit(1);
    return c ?? null;
  } catch {
    return null;
  }
}

/**
 * slug → 캠페인. redirect 테이블도 확인.
 * 반환: { campaign } | { redirectTo } | null
 */
export async function resolveCampaignSlug(
  slug: string,
): Promise<
  | { campaign: Campaign; redirectTo?: undefined }
  | { redirectTo: string; campaign?: undefined }
  | null
> {
  try {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.slug, slug))
      .limit(1);
    if (c) return { campaign: c };

    const [r] = await db
      .select({ slug: campaigns.slug })
      .from(campaignSlugRedirects)
      .innerJoin(campaigns, eq(campaigns.id, campaignSlugRedirects.campaignId))
      .where(eq(campaignSlugRedirects.oldSlug, slug))
      .limit(1);
    if (r) return { redirectTo: r.slug };
    return null;
  } catch {
    return null;
  }
}

/** 관리자 필터 드롭다운용 (템플릿 제외) */
export async function listCampaigns(): Promise<
  Pick<Campaign, "id" | "slug" | "name" | "isDefault" | "status">[]
> {
  try {
    return await db
      .select({
        id: campaigns.id,
        slug: campaigns.slug,
        name: campaigns.name,
        isDefault: campaigns.isDefault,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(eq(campaigns.isTemplate, false))
      .orderBy(desc(campaigns.isDefault), campaigns.name);
  } catch {
    return [];
  }
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  try {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return c ?? null;
  } catch {
    return null;
  }
}

export type Variant = "a" | "b";

/** 캠페인의 발행된 페이지 데이터 (없으면 기본 구성). variant 는 landing A/B 용. */
export async function getCampaignPageData(
  campaignId: string,
  pageType: PageType,
  variant: Variant = "a",
): Promise<FunnelData> {
  try {
    const [row] = await db
      .select()
      .from(campaignPages)
      .where(
        and(
          eq(campaignPages.campaignId, campaignId),
          eq(campaignPages.pageType, pageType),
          eq(campaignPages.variant, variant),
          eq(campaignPages.published, true),
        ),
      )
      .orderBy(desc(campaignPages.version))
      .limit(1);
    if (row) return row.data as FunnelData;
    // variant b 발행본이 없으면 a 로 폴백
    if (variant === "b") return getCampaignPageData(campaignId, pageType, "a");
  } catch {
    /* DB 미연결 */
  }
  return defaultPages[pageType] ?? defaultPages.landing;
}

// A/B 대상 캐시 (middleware 용, 30초 TTL)
let _abCache: { at: number; slugs: Set<string>; defaultOn: boolean } | null =
  null;
export function bustAbCache() {
  _abCache = null;
}
export async function getAbLandingState(): Promise<{
  slugs: Set<string>;
  defaultOn: boolean;
}> {
  if (_abCache && Date.now() - _abCache.at < 30_000) return _abCache;
  try {
    const rows = await db
      .select({
        slug: campaigns.slug,
        isDefault: campaigns.isDefault,
        abLanding: campaigns.abLanding,
      })
      .from(campaigns);
    _abCache = {
      at: Date.now(),
      slugs: new Set(rows.filter((r) => r.abLanding).map((r) => r.slug)),
      defaultOn: rows.some((r) => r.isDefault && r.abLanding),
    };
  } catch {
    _abCache = { at: Date.now(), slugs: new Set(), defaultOn: false };
  }
  return _abCache;
}

/** 캠페인 기준 경로 접두사. 기본 캠페인은 "" (기존 URL 유지) */
export function campaignBasePath(c: Pick<Campaign, "slug" | "isDefault">) {
  return c.isDefault ? "" : `/${c.slug}`;
}

/** 결제 후 이동 URL (기본: 시청 페이지 + ?paid=1 로 Purchase 픽셀 발화) */
export function checkoutRedirect(c: Campaign) {
  return c.checkoutRedirectUrl || `${campaignBasePath(c)}/vod?paid=1`;
}
