import type { ReactNode } from "react";
import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adDailyStats, leads, orders } from "@/db/schema";
import { Card, PageHeader, won } from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";

export const dynamic = "force-dynamic";

const TZ = "Asia/Seoul";
const LOW_TICKET_MAX = Number(process.env.META_SLO_MAX ?? 300000);

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
/** 비율(%) — 분모가 0이면 계산 불가라 "—" */
function rp(a: number, b: number) {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
}
/** 1건당 금액 — 분모가 0이면 "—" */
function rw(a: number, b: number) {
  return b > 0 ? won(Math.round(a / b)) : "—";
}

/** 초보자용 설명이 달린 지표 카드 */
function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-400">{hint}</p>
    </div>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 font-semibold text-zinc-600">{name}</span>
      <span className="text-zinc-500">{children}</span>
    </div>
  );
}

type Row = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  lowOrders: number;
  lowRevenue: number;
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
    lowOrders: 0,
    lowRevenue: 0,
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
        count(*) filter (where amount <= ${LOW_TICKET_MAX})::int as low_n,
        coalesce(sum(amount) filter (where amount <= ${LOW_TICKET_MAX}),0)::int as low_rev,
        count(*) filter (where amount > ${LOW_TICKET_MAX})::int as main_n,
        coalesce(sum(amount) filter (where amount > ${LOW_TICKET_MAX}),0)::int as main_rev
      from ${orders}
      where status = 'success'
        and ${dExpr("coalesce(paid_at, created_at)")} between ${from} and ${to} ${campWhere}
      group by d`)) as unknown as {
      d: string;
      low_n: number;
      low_rev: number;
      main_n: number;
      main_rev: number;
    }[];
    for (const o of orderRows) {
      const r = get(o.d);
      r.lowOrders = Number(o.low_n);
      r.lowRevenue = Number(o.low_rev);
      r.mainOrders = Number(o.main_n);
      r.mainRevenue = Number(o.main_rev);
    }
  } catch {
    connected = false;
  }

  const rows = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  const t = rows.reduce((acc, r) => {
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.leads += r.leads;
    acc.lowOrders += r.lowOrders;
    acc.lowRevenue += r.lowRevenue;
    acc.mainOrders += r.mainOrders;
    acc.mainRevenue += r.mainRevenue;
    return acc;
  }, blank("total"));
  const revenue = t.lowRevenue + t.mainRevenue;
  const lowLabel = `저가상품(≤${(LOW_TICKET_MAX / 10000).toLocaleString()}만원)`;

  return (
    <>
      <PageHeader
        title="광고 성과 (Meta)"
        desc="Meta 광고에서 나온 방문·신청·매출을 한 표로. 광고비·노출·클릭은 매일 새벽 자동 동기화"
        actions={<CampaignFilter options={campaignOptions} />}
      />

      <SectionTabs set="revenue" />

      <form className="mb-5 flex items-end gap-2 text-sm" method="get">
        {campaignId && (
          <input type="hidden" name="campaign" value={campaignId} />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">시작일</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">종료일</span>
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
          아직 동기화된 광고 데이터가 없습니다 (Meta 토큰 미설정이거나 첫 동기화
          전).
        </p>
      )}

      {(t.spend === 0 && t.impressions === 0) && connected && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          광고비·노출·클릭이 모두 0입니다. Meta 광고 지표 연동(<code>
          META_ACCESS_TOKEN</code>, <code>META_AD_ACCOUNT_ID</code>)이 아직 안 된
          상태예요. 신청자·매출 수치는 우리 DB 기준으로 정상 집계됩니다.
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="광고비"
          value={won(t.spend)}
          hint="이 기간에 Meta 광고로 지출한 총액"
        />
        <StatCard
          label="노출"
          value={t.impressions.toLocaleString()}
          hint="광고가 사람들 화면에 표시된 총 횟수"
        />
        <StatCard
          label="클릭"
          value={t.clicks.toLocaleString()}
          hint="광고를 눌러 우리 사이트로 들어온 횟수"
        />
        <StatCard
          label="클릭률 (CTR)"
          value={rp(t.clicks, t.impressions)}
          hint="클릭 ÷ 노출. 광고가 얼마나 눈길을 끄는지"
        />
        <StatCard
          label="클릭당 비용 (CPC)"
          value={rw(t.spend, t.clicks)}
          hint="광고비 ÷ 클릭. 방문자 1명 데려오는 데 든 돈"
        />
        <StatCard
          label="신청자 (DB)"
          value={t.leads.toLocaleString()}
          hint="랜딩에서 이름·연락처를 남긴 사람 수"
        />
        <StatCard
          label="신청 전환율"
          value={rp(t.leads, t.clicks)}
          hint="신청자 ÷ 클릭. 방문자 중 몇 %가 신청했나"
        />
        <StatCard
          label="신청 1건당 광고비"
          value={rw(t.spend, t.leads)}
          hint="광고비 ÷ 신청자. 신청자(DB) 하나 확보 비용"
        />
        <StatCard
          label={`${lowLabel} 주문`}
          value={`${t.lowOrders}건`}
          hint="결제 금액이 기준 이하인 주문 건수"
        />
        <StatCard
          label="광고비 회수율"
          value={rp(t.lowRevenue, t.spend)}
          hint="저가상품 매출 ÷ 광고비. 100%↑면 저가상품만으로 광고비 회수"
        />
        <StatCard
          label="본상품 주문"
          value={`${t.mainOrders}건`}
          hint="결제 금액이 기준 초과인 주문 건수"
        />
        <StatCard
          label="ROAS"
          value={rp(revenue, t.spend)}
          hint="총매출 ÷ 광고비. 광고비 1원당 벌어들인 매출"
        />
      </div>

      <details className="mb-6 rounded-xl border bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-zinc-700">
          용어 설명 · 처음 보시나요?
        </summary>
        <div className="mt-3 space-y-2">
          <Term name="노출">
            광고가 누군가의 피드/화면에 나타난 횟수. 클릭하지 않아도 카운트됩니다.
          </Term>
          <Term name="클릭">
            그 광고를 눌러 우리 랜딩페이지로 들어온 횟수.
          </Term>
          <Term name="클릭률 (CTR)">
            클릭 ÷ 노출 × 100. 보통 1~3%면 무난, 높을수록 광고 소재가 매력적입니다.
          </Term>
          <Term name="클릭당 비용 (CPC)">
            광고비 ÷ 클릭. 방문자 1명을 데려오는 데 든 평균 비용.
          </Term>
          <Term name="신청자 (DB)">
            랜딩에서 이름·이메일·전화번호를 남긴 사람. &quot;DB&quot;라고도 부릅니다.
          </Term>
          <Term name="신청 전환율">
            신청자 ÷ 클릭 × 100. 들어온 방문자 중 실제로 신청 폼을 채운 비율.
          </Term>
          <Term name="신청 1건당 광고비">
            광고비 ÷ 신청자. &quot;DB 단가&quot;. 이 값이 낮을수록 효율적입니다.
          </Term>
          <Term name="저가상품">
            웨비나 직후 파는 낮은 가격의 상품(SLO). 여기서는 결제액{" "}
            {won(LOW_TICKET_MAX)} 이하 주문을 저가상품으로 봅니다. (기준값은 env{" "}
            <code>META_SLO_MAX</code> 로 조정)
          </Term>
          <Term name="본상품">
            상담·컨설팅 등 높은 가격의 메인 상품. 결제액 {won(LOW_TICKET_MAX)}{" "}
            초과 주문.
          </Term>
          <Term name="광고비 회수율">
            저가상품 매출 ÷ 광고비 × 100. 100%를 넘으면 저가상품 판매만으로 이미
            광고비를 다 회수했다는 뜻(그 뒤 본상품 매출은 순이익).
          </Term>
          <Term name="ROAS">
            Return On Ad Spend. 총매출 ÷ 광고비. 예: 300%면 광고비 1원당 3원 매출.
          </Term>
        </div>
      </details>

      <Card className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
          <p className="text-sm font-bold">일자별 상세</p>
          <p className="text-xs text-zinc-400">
            비율 칸의 &quot;—&quot;는 나눌 값(예: 광고비·클릭)이 0이라 계산 불가라는
            뜻입니다.
          </p>
        </div>
        <table className="w-full min-w-[820px] text-right text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-zinc-500">
              <th className="pb-2 text-left font-medium">날짜</th>
              <th className="pb-2 font-medium" title="Meta 광고 지출">
                광고비
              </th>
              <th className="pb-2 font-medium" title="광고가 표시된 횟수">
                노출
              </th>
              <th className="pb-2 font-medium" title="광고를 눌러 방문한 횟수">
                클릭
              </th>
              <th className="pb-2 font-medium" title="클릭 ÷ 노출">
                클릭률
              </th>
              <th className="pb-2 font-medium" title="이름·연락처 남긴 사람">
                신청자
              </th>
              <th className="pb-2 font-medium" title="신청자 ÷ 클릭">
                신청률
              </th>
              <th className="pb-2 font-medium" title="광고비 ÷ 신청자">
                신청단가
              </th>
              <th className="pb-2 font-medium" title={`${lowLabel} 주문 수`}>
                저가상품
              </th>
              <th className="pb-2 font-medium" title="저가상품 결제 금액 합계">
                저가매출
              </th>
              <th className="pb-2 font-medium" title="저가매출 ÷ 광고비">
                회수율
              </th>
              <th className="pb-2 font-medium" title="본상품 주문 수">
                본상품
              </th>
              <th className="pb-2 font-medium" title="총매출 ÷ 광고비">
                ROAS
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-zinc-50 font-bold">
              <td className="py-2 text-left">합계</td>
              <td>{won(t.spend)}</td>
              <td>{t.impressions.toLocaleString()}</td>
              <td>{t.clicks.toLocaleString()}</td>
              <td>{rp(t.clicks, t.impressions)}</td>
              <td>{t.leads}</td>
              <td>{rp(t.leads, t.clicks)}</td>
              <td>{rw(t.spend, t.leads)}</td>
              <td>{t.lowOrders}건</td>
              <td>{won(t.lowRevenue)}</td>
              <td>{rp(t.lowRevenue, t.spend)}</td>
              <td>{t.mainOrders}건</td>
              <td>{rp(revenue, t.spend)}</td>
            </tr>
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-6 text-center text-zinc-400">
                  이 기간에 데이터가 없습니다
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const rev = r.lowRevenue + r.mainRevenue;
              return (
                <tr key={r.date}>
                  <td className="py-2 text-left">{r.date}</td>
                  <td>{won(r.spend)}</td>
                  <td>{r.impressions.toLocaleString()}</td>
                  <td>{r.clicks.toLocaleString()}</td>
                  <td>{rp(r.clicks, r.impressions)}</td>
                  <td>{r.leads}</td>
                  <td>{rp(r.leads, r.clicks)}</td>
                  <td>{rw(r.spend, r.leads)}</td>
                  <td>{r.lowOrders}건</td>
                  <td>{won(r.lowRevenue)}</td>
                  <td>{rp(r.lowRevenue, r.spend)}</td>
                  <td>{r.mainOrders}건</td>
                  <td>{rp(rev, r.spend)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
