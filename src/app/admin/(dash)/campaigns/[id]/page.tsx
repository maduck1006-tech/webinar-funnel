import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adDailyStats, campaigns, leads, orders } from "@/db/schema";
import { Card, PageHeader, Stat, Tag, won } from "@/components/admin-ui";
import { campaignBasePath } from "@/lib/campaign";
import { getSetupChecklist } from "@/lib/campaign-setup";
import { SetupChecklist } from "./SetupChecklist";
import { CampaignTabs } from "./CampaignTabs";
import { flowSummary, resolveFlowSteps } from "@/lib/funnel-flow";
import { endAbTest, setCampaignStatus, startAbTest } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignHub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id));
  if (!campaign) notFound();

  const basePath = campaignBasePath(campaign);

  const [m] = await db
    .select({
      leads: sql<number>`count(*)`,
      watched: sql<number>`count(*) filter (where ${leads.firstWatchedAt} is not null)`,
      booked: sql<number>`count(*) filter (where ${leads.status} in ('booked','consulted'))`,
      purchasedLeads: sql<number>`count(*) filter (where ${leads.status} in ('purchased','booked','consulted','member'))`,
    })
    .from(leads)
    .where(eq(leads.campaignId, id));
  const [o] = await db
    .select({
      n: sql<number>`count(*) filter (where ${orders.status} = 'success')`,
      revenue: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.status} = 'success'), 0)`,
    })
    .from(orders)
    .where(eq(orders.campaignId, id));
  const [ad] = await db
    .select({
      spend: sql<number>`coalesce(sum(${adDailyStats.spend}), 0)`,
      clicks: sql<number>`coalesce(sum(${adDailyStats.clicks}), 0)`,
    })
    .from(adDailyStats)
    .where(eq(adDailyStats.campaignId, id))
    .catch(() => [{ spend: 0, clicks: 0 }]);

  const checklist = await getSetupChecklist(campaign).catch(() => null);

  // A/B: 변형별 신청/구매
  const abRows = campaign.abLanding
    ? await db
        .select({
          v: leads.landingVariant,
          n: sql<number>`count(*)`,
          purchased: sql<number>`count(*) filter (where ${leads.status} in ('purchased','booked','consulted'))`,
        })
        .from(leads)
        .where(eq(leads.campaignId, id))
        .groupBy(leads.landingVariant)
        .catch(() => [])
    : [];
  const abStat = (v: "a" | "b") => {
    const r = abRows.find((x) => x.v === v);
    const n = Number(r?.n ?? 0);
    const p = Number(r?.purchased ?? 0);
    return { n, p, rate: n ? Math.round((p / n) * 100) : 0 };
  };

  return (
    <>
      <PageHeader
        title={campaign.name}
        desc={
          <span className="flex items-center gap-2">
            <code className="text-xs">{basePath || "/"}</code>
            <Tag tone={campaign.status === "live" ? "green" : "amber"}>
              {campaign.status}
            </Tag>
            {campaign.isDefault && <Tag tone="green">기본</Tag>}
          </span>
        }
        actions={
          <form action={setCampaignStatus}>
            <input type="hidden" name="id" value={id} />
            <input
              type="hidden"
              name="status"
              value={campaign.status === "live" ? "draft" : "live"}
            />
            <button className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">
              {campaign.status === "live" ? "비공개로" : "발행(live)"}
            </button>
          </form>
        }
      />

      <CampaignTabs id={id} slug={campaign.slug} />

      {checklist && (
        <SetupChecklist
          campaignId={id}
          groups={checklist.groups}
          requiredDone={checklist.requiredDone}
          requiredTotal={checklist.requiredTotal}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="신청" value={`${Number(m?.leads ?? 0)}건`} />
        <Stat
          label="시청 시작"
          value={`${Number(m?.watched ?? 0)}건`}
        />
        <Stat label="저가 구매" value={`${Number(o?.n ?? 0)}건`} />
        <Stat label="매출" value={won(Number(o?.revenue ?? 0))} />
      </div>

      {(() => {
        const nLeads = Number(m?.leads ?? 0);
        const nWatch = Number(m?.watched ?? 0);
        const nBuy = Number(o?.n ?? 0);
        const nBook = Number(m?.booked ?? 0);
        const revenue = Number(o?.revenue ?? 0);
        const spend = Number(ad?.spend ?? 0);
        const clicks = Number(ad?.clicks ?? 0);
        const pct = (a: number, b: number) =>
          b > 0 ? `${Math.round((a / b) * 100)}%` : "—";
        const aov = nBuy > 0 ? won(Math.round(revenue / nBuy)) : "—";
        const epc = clicks > 0 ? won(Math.round(revenue / clicks)) : "—";
        const roas = spend > 0 ? `${(revenue / spend).toFixed(2)}x` : "—";
        const cpl = spend > 0 && nLeads > 0 ? won(Math.round(spend / nLeads)) : "—";

        const funnel: { label: string; n: number; of: number }[] = [
          { label: "신청", n: nLeads, of: nLeads },
          { label: "시청 시작", n: nWatch, of: nLeads },
          { label: "저가 구매", n: nBuy, of: nWatch || nLeads },
          { label: "예약", n: nBook, of: nBuy || nWatch || nLeads },
        ];

        return (
          <Card className="mt-6">
            <p className="mb-3 text-sm font-bold">퍼널 지표</p>
            <div className="space-y-2">
              {funnel.map((f, i) => (
                <div key={f.label} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 text-zinc-500">{f.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-zinc-100">
                    <div
                      className="h-full rounded bg-[var(--fn-accent,#ff3d2e)]"
                      style={{
                        width: `${
                          nLeads > 0 ? Math.max(2, (f.n / nLeads) * 100) : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-semibold text-zinc-800">
                    {f.n}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs text-zinc-400">
                    {i === 0 ? "" : pct(f.n, f.of)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-zinc-400">객단가(AOV)</p>
                <p className="font-bold text-zinc-800">{aov}</p>
              </div>
              <div>
                <p className="text-zinc-400">클릭당 수익(EPC)</p>
                <p className="font-bold text-zinc-800">{epc}</p>
              </div>
              <div>
                <p className="text-zinc-400">ROAS</p>
                <p className="font-bold text-zinc-800">{roas}</p>
              </div>
              <div>
                <p className="text-zinc-400">신청 단가(CPL)</p>
                <p className="font-bold text-zinc-800">{cpl}</p>
              </div>
            </div>
            {spend === 0 && (
              <p className="mt-2 text-[11px] text-zinc-400">
                광고 지표는 캠페인 설정에서 Meta 광고 계정을 연결하면 채워집니다.
              </p>
            )}
          </Card>
        );
      })()}

      {campaign.abLanding ? (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">랜딩 A/B 테스트 진행 중</p>
            <span className="text-xs text-zinc-400">트래픽 50:50</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["a", "b"] as const).map((v) => {
              const s = abStat(v);
              return (
                <div key={v} className="rounded-xl border p-4">
                  <p className="mb-1 text-sm font-bold">
                    변형 {v.toUpperCase()}
                  </p>
                  <p className="text-xs text-zinc-500">
                    신청 {s.n} · 구매 {s.p} · 전환율{" "}
                    <b className="text-zinc-800">{s.rate}%</b>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Link
                      href={`/admin/builder/${id}/landing${v === "b" ? "?variant=b" : ""}`}
                      className="rounded-md bg-black px-3 py-1.5 text-xs text-white"
                    >
                      편집
                    </Link>
                    <form action={endAbTest}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="winner" value={v} />
                      <button className="rounded-md border px-3 py-1.5 text-xs">
                        이 변형 채택
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="mt-6 flex items-center justify-between">
          <p className="text-sm">
            <b>랜딩 A/B 테스트</b>{" "}
            <span className="text-zinc-400">
              — 발행된 랜딩을 복제해 변형 B를 만들고 트래픽을 50:50으로 나눕니다.
            </span>
          </p>
          <form action={startAbTest}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-lg border px-3 py-2 text-sm font-semibold">
              A/B 테스트 시작
            </button>
          </form>
        </Card>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">퍼널 흐름</p>
            <p className="mt-1 text-[13px] text-zinc-600">
              {flowSummary(resolveFlowSteps(campaign)) || "사용 중인 단계 없음"}
            </p>
          </div>
          <Link
            href={`/admin/campaigns/${id}/funnel`}
            className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            퍼널 편집 →
          </Link>
        </div>
      </Card>
    </>
  );
}

