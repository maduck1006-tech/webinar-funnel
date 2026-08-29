import { NextResponse } from "next/server";
import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { adDailyStats, campaigns } from "@/db/schema";
import { fetchMetaInsights, daysAgo } from "@/lib/meta-insights";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Meta 광고 지표 일일 동기화.
 * - 기본: 최근 7일(늦게 붙는 전환·환불 반영 위해 재수집)
 * - ?since=YYYY-MM-DD&until=YYYY-MM-DD 로 백필 가능
 * - 캠페인별 metaAdCampaignIds 로 귀속. 아무 캠페인도 지정 안 했고
 *   기본 캠페인만 있으면 계정 전체 광고비를 기본 캠페인에 귀속.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  const defaultAccount = process.env.META_AD_ACCOUNT_ID;
  if (!token) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN 미설정" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? daysAgo(7);
  const until = url.searchParams.get("until") ?? daysAgo(0);

  const all = await db.select().from(campaigns);
  const active = all.filter((c) => c.status !== "archived" && !c.isTemplate);
  const anyExplicit = active.some(
    (c) => (c.metaAdCampaignIds?.length ?? 0) > 0,
  );

  const results: Record<string, unknown> = {};
  let synced = 0;

  for (const c of active) {
    const accountId = c.metaAdAccountId || defaultAccount;
    const campaignIds = c.metaAdCampaignIds ?? undefined;
    // 명시적 매핑 없음 + 기본 캠페인이 아니거나, 다른 캠페인이 매핑을 쓰는 경우 → 스킵
    const takeWholeAccount = !campaignIds?.length && c.isDefault && !anyExplicit;
    if (!accountId || (!campaignIds?.length && !takeWholeAccount)) {
      results[c.slug] = "skipped (매핑 없음)";
      continue;
    }

    try {
      const rows = await fetchMetaInsights({
        accountId,
        token,
        since,
        until,
        campaignIds: campaignIds?.length ? campaignIds : undefined,
      });
      for (const r of rows) {
        await db
          .insert(adDailyStats)
          .values({
            campaignId: c.id,
            date: r.date,
            source: "meta",
            impressions: r.impressions,
            clicks: r.clicks,
            spend: r.spend,
            reach: r.reach,
            raw: r,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              adDailyStats.campaignId,
              adDailyStats.date,
              adDailyStats.source,
            ],
            set: {
              impressions: r.impressions,
              clicks: r.clicks,
              spend: r.spend,
              reach: r.reach,
              raw: r,
              syncedAt: new Date(),
            },
          });
      }
      synced += rows.length;
      results[c.slug] = `${rows.length} days`;
    } catch (e) {
      results[c.slug] = `error: ${(e as Error).message}`;
    }
  }

  // 오래된 raw 정리(옵션): 90일 이전 raw 컬럼 비움
  await db
    .update(adDailyStats)
    .set({ raw: null })
    .where(
      and(
        sql`${adDailyStats.date} < ${daysAgo(90)}`,
        sql`${adDailyStats.raw} is not null`,
      ),
    );

  return NextResponse.json({ ok: true, since, until, synced, results });
}
