/**
 * Meta Marketing API — 광고 지표(insights) 수집.
 * 크론(/api/cron/meta-insights)이 호출해 ad_daily_stats 로 upsert 한다.
 *
 * 토큰: 시스템 사용자 장기 토큰(권한 ads_read). env META_ACCESS_TOKEN.
 * 계정 ID: 숫자만 (act_ 접두는 코드에서 붙임). env META_AD_ACCOUNT_ID 또는 캠페인 오버라이드.
 */

const API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export type InsightRow = {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  spend: number; // 계정 통화 그대로 (원 가정)
  reach: number;
};

type RawInsight = {
  date_start: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
};

function accumulate(map: Map<string, InsightRow>, r: RawInsight) {
  const d = r.date_start;
  const cur = map.get(d) ?? {
    date: d,
    impressions: 0,
    clicks: 0,
    spend: 0,
    reach: 0,
  };
  cur.impressions += Number(r.impressions ?? 0);
  cur.clicks += Number(r.clicks ?? 0);
  cur.spend += Number(r.spend ?? 0);
  cur.reach += Number(r.reach ?? 0);
  map.set(d, cur);
}

/**
 * @param since / until  YYYY-MM-DD (inclusive)
 * @param campaignIds     주어지면 level=campaign + 필터, 없으면 계정 전체(level=account)
 */
export async function fetchMetaInsights(opts: {
  accountId: string;
  token: string;
  since: string;
  until: string;
  campaignIds?: string[];
}): Promise<InsightRow[]> {
  const acct = opts.accountId.replace(/^act_/, "");
  const params = new URLSearchParams({
    access_token: opts.token,
    time_increment: "1",
    fields: "impressions,clicks,spend,reach",
    time_range: JSON.stringify({ since: opts.since, until: opts.until }),
    limit: "500",
  });
  if (opts.campaignIds?.length) {
    params.set("level", "campaign");
    params.set(
      "filtering",
      JSON.stringify([
        {
          field: "campaign.id",
          operator: "IN",
          value: opts.campaignIds,
        },
      ]),
    );
  } else {
    params.set("level", "account");
  }

  const byDate = new Map<string, InsightRow>();
  let url: string | null = `${GRAPH}/act_${acct}/insights?${params.toString()}`;
  let guard = 0;

  while (url && guard++ < 50) {
    const res: Response = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: RawInsight[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };
    if (!res.ok || json.error) {
      throw new Error(
        `Meta insights ${res.status}: ${json.error?.message ?? "unknown"}`,
      );
    }
    for (const row of json.data ?? []) accumulate(byDate, row);
    url = json.paging?.next ?? null;
  }

  return [...byDate.values()]
    .map((r) => ({
      ...r,
      spend: Math.round(r.spend),
      impressions: Math.round(r.impressions),
      clicks: Math.round(r.clicks),
      reach: Math.round(r.reach),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** YYYY-MM-DD (UTC) n일 전 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
