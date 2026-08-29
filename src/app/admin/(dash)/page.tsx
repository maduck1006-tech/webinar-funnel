import { Card, PageHeader, Stat, fmtDate, won } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { getDashboard } from "@/lib/admin-queries";
import { listCampaigns } from "@/lib/campaign";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign } = await searchParams;
  const [d, campaignOptions] = await Promise.all([
    getDashboard(campaign),
    listCampaigns(),
  ]);
  const max = Math.max(1, ...d.funnel.map((f) => f.value));

  return (
    <>
      <PageHeader
        title="대시보드"
        desc="퍼널 전체 현황 · 지표 → 전환 퍼널 → 실시간 이벤트"
        actions={<CampaignFilter options={campaignOptions} />}
      />

      {!d.connected && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          DB 연결/데이터가 없어 0으로 표시됩니다. <code>npm run db:push</code> +{" "}
          <code>npm run seed</code> 후 확인하세요.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="신규 DB 입력 (7일)" value={`${d.metrics.newLeads7d}건`} />
        <Stat label="VOD 시청 시작률" value={`${d.metrics.watchRate}%`} />
        <Stat
          label="저가 상품 구매"
          value={`${d.metrics.purchases}건 · ${won(d.metrics.revenue)}`}
        />
        <Stat label="상담 예약" value={`${d.metrics.bookings}건`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-4 text-sm font-bold">퍼널 전환</p>
          <div className="space-y-3">
            {d.funnel.map((f, i) => {
              const prev = i > 0 ? d.funnel[i - 1].value : f.value;
              const rate = prev ? Math.round((f.value / prev) * 100) : 100;
              return (
                <div key={f.label}>
                  <div className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>{f.label}</span>
                    <span className="tabular-nums">
                      {f.value.toLocaleString()}
                      {i > 0 && ` · ${rate}%`}
                    </span>
                  </div>
                  <div className="h-6 rounded bg-zinc-100">
                    <div
                      className="h-6 rounded bg-zinc-800"
                      style={{ width: `${(f.value / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <p className="mb-4 text-sm font-bold">실시간 이벤트 피드</p>
          {d.feed.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">이벤트 없음</p>
          ) : (
            <ul className="divide-y text-sm">
              {d.feed.map((e, i) => (
                <li key={i} className="flex gap-3 py-2">
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {fmtDate(e.at)}
                  </span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
