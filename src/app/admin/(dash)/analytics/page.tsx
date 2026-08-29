import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adDailyStats, leads, orders } from "@/db/schema";
import { Card, PageHeader, Stat, won } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";

export const dynamic = "force-dynamic";

const TZ = "Asia/Seoul";
const SLO_MAX = Number(process.env.META_SLO_MAX ?? 300000);

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function ratio(a: number, b: number) {
  return b > 0 ? a / b : 0;
}

type Row = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  sloOrders: number;
  sloRevenue: number;
  mainOrders: number;
  mainRevenue: number;
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const campaignOptions = await listCampaigns();
  const campaignId = sp.campaign || null;

  const today = new Date();
  const defFrom = new Date(today);
  defFrom.setDate(defFrom.getDate() - 29);
  const from = sp.from || ymd(defFrom);
  const to = sp.to || ymd(today);

  const campWhere = campaignId ? sql` and campaign_id = ${campaignId}` : sql``;
  const dExpr = (col: string) =>
    sql`to_char(${sql.raw(col)} at time zone ${TZ}, 'YYYY-MM-DD')`;

  let connected = true;
  const map = new Map<string, Row>();
  const blank = (date: string): Row => ({
    date,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    sloOrders: 0,
    sloRevenue: 0,
    mainOrders: 0,
    mainRevenue: 0,
  });
  const get = (date: string) => {
    let r = map.get(date);
    if (!r) map.set(date, (r = blank(date)));
    return r;
  };

  try {
    const ads = await db
      .select({
        date: adDailyStats.date,
        spend: sql<number>`sum(${adDailyStats.spend})::int`,
        impressions: sql<number>`sum(${adDailyStats.impressions})::int`,
        clicks: sql<number>`sum(${adDailyStats.clicks})::int`,
      })
      .from(adDailyStats)
      .where(
        and(
          between(adDailyStats.date, from, to),
          campaignId ? eq(adDailyStats.campaignId, campaignId) : undefined,
        ),
      )
      .groupBy(adDailyStats.date);
    for (const a of ads) {
      const r = get(a.date);
      r.spend = a.spend;
      r.impressions = a.impressions;
      r.clicks = a.clicks;
    }

    const leadRows = (await db.execute(sql`
      select ${dExpr("created_at")} as d, count(*)::int as n
      from ${leads}
      where ${dExpr("created_at")} between ${from} and ${to} ${campWhere}
      group by d`)) as unknown as { d: string; n: number }[];
    for (const l of leadRows) get(l.d).leads = Number(l.n);

    const orderRows = (await db.execute(sql`
      select ${dExpr("coalesce(paid_at, created_at)")} as d,
        count(*) filter (where amount <= ${SLO_MAX})::int as slo_n,
        coalesce(sum(amount) filter (where amount <= ${SLO_MAX}),0)::int as slo_rev,
        count(*) filter (where amount > ${SLO_MAX})::int as main_n,
        coalesce(sum(amount) filter (where amount > ${SLO_MAX}),0)::int as main_rev
      from ${orders}
      where status = 'success'
        and ${dExpr("coalesce(paid_at, created_at)")} between ${from} and ${to} ${campWhere}
      group by d`)) as unknown as {
      d: string;
      slo_n: number;
      slo_rev: number;
      main_n: number;
      main_rev: number;
    }[];
    for (const o of orderRows) {
      const r = get(o.d);
      r.sloOrders = Number(o.slo_n);
      r.sloRevenue = Number(o.slo_rev);
      r.mainOrders = Number(o.main_n);
      r.mainRevenue = Number(o.main_rev);
    }
  } catch {
    connected = false;
  }

  const rows = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  const t = rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.leads += r.leads;
      acc.sloOrders += r.sloOrders;
      acc.sloRevenue += r.sloRevenue;
      acc.mainOrders += r.mainOrders;
      acc.mainRevenue += r.mainRevenue;
      return acc;
    },
    blank("total"),
  );
  const revenue = t.sloRevenue + t.mainRevenue;

  return (
    <>
      <PageHeader
        title="광고 성과 (Meta)"
        desc="Meta 광고비·노출·클릭 + 리드·매출 통합 퍼널 리포트. 크론 일 1회(01:00 UTC) 동기화"
        actions={<CampaignFilter options={campaignOptions} />}
      />

      <form className="mb-5 flex items-end gap-2 text-sm" method="get">
        {campaignId && (
          <input type="hidden" name="campaign" value={campaignId} />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">시작</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">종료</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border px-2 py-1"
          />
        </label>
        <button className="rounded-md bg-black px-3 py-1.5 font-semibold text-white">
          적용
        </button>
      </form>

      {!connected && (
        <p className="mb-4 text-sm text-amber-600">
          DB 미연결 또는 아직 동기화된 광고 데이터 없음
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="광고비" value={won(t.spend)} />
        <Stat label="노출" value={t.impressions.toLocaleString()} />
        <Stat label="클릭" value={t.clicks.toLocaleString()} />
        <Stat label="CTR" value={pct(ratio(t.clicks, t.impressions))} />
        <Stat
          label="CPC"
          value={won(Math.round(ratio(t.spend, t.clicks)))}
        />
        <Stat label="리드(DB)" value={t.leads.toLocaleString()} />
        <Stat
          label="DB 전환율"
          value={pct(ratio(t.leads, t.clicks))}
        />
        <Stat
          label="DB당 비용"
          value={won(Math.round(ratio(t.spend, t.leads)))}
        />
        <Stat label="SLO 주문" value={String(t.sloOrders)} />
        <Stat
          label="광고비 상쇄율"
          value={pct(ratio(t.sloRevenue, t.spend))}
        />
        <Stat label="본상품 주문" value={String(t.mainOrders)} />
        <Stat label="ROAS" value={pct(ratio(revenue, t.spend))} />
      </div>

      <Card className="overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">일자별</p>
          <p className="text-xs text-zinc-400">
            SLO 기준: 결제액 ≤ {won(SLO_MAX)} (env META_SLO_MAX)
          </p>
        </div>
        <table className="w-full text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-zinc-500">
              <th className="pb-2 text-left">날짜</th>
              <th className="pb-2">광고비</th>
              <th className="pb-2">노출</th>
              <th className="pb-2">클릭</th>
              <th className="pb-2">CTR</th>
              <th className="pb-2">리드</th>
              <th className="pb-2">DB전환</th>
              <th className="pb-2">DB단가</th>
              <th className="pb-2">SLO</th>
              <th className="pb-2">SLO매출</th>
              <th className="pb-2">상쇄율</th>
              <th className="pb-2">본상품</th>
              <th className="pb-2">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-zinc-50 font-bold">
              <td className="py-2 text-left">합계</td>
              <td>{won(t.spend)}</td>
              <td>{t.impressions.toLocaleString()}</td>
              <td>{t.clicks.toLocaleString()}</td>
              <td>{pct(ratio(t.clicks, t.impressions))}</td>
              <td>{t.leads}</td>
              <td>{pct(ratio(t.leads, t.clicks))}</td>
              <td>{won(Math.round(ratio(t.spend, t.leads)))}</td>
              <td>{t.sloOrders}</td>
              <td>{won(t.sloRevenue)}</td>
              <td>{pct(ratio(t.sloRevenue, t.spend))}</td>
              <td>{t.mainOrders}</td>
              <td>{pct(ratio(revenue, t.spend))}</td>
            </tr>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-6 text-center text-zinc-400">
                  데이터 없음
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const rev = r.sloRevenue + r.mainRevenue;
              return (
                <tr key={r.date}>
                  <td className="py-2 text-left">{r.date}</td>
                  <td>{won(r.spend)}</td>
                  <td>{r.impressions.toLocaleString()}</td>
                  <td>{r.clicks.toLocaleString()}</td>
                  <td>{pct(ratio(r.clicks, r.impressions))}</td>
                  <td>{r.leads}</td>
                  <td>{pct(ratio(r.leads, r.clicks))}</td>
                  <td>{won(Math.round(ratio(r.spend, r.leads)))}</td>
                  <td>{r.sloOrders}</td>
                  <td>{won(r.sloRevenue)}</td>
                  <td>{pct(ratio(r.sloRevenue, r.spend))}</td>
                  <td>{r.mainOrders}</td>
                  <td>{pct(ratio(rev, r.spend))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
