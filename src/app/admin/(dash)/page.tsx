import Link from "next/link";
import { Card, PageHeader, Tag, won } from "@/components/admin-ui";
import { getToday } from "@/lib/today";

export const dynamic = "force-dynamic";

export default async function AdminToday() {
  const t = await getToday();
  const { week } = t;

  return (
    <>
      <PageHeader title="오늘" desc="지금 처리할 것부터" />

      {/* 아직 아무것도 없는 계정 — 어디서 시작하는지부터 알려준다 */}
      {t.campaigns.length === 0 && (
        <Card className="mb-6">
          <p className="text-sm font-bold">👋 처음이시죠? 순서는 두 개뿐이에요</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
            먼저 문자·결제 같은 <b>외부 서비스를 연결</b>하고, 그다음 <b>퍼널을 하나</b>
            만들면 됩니다. 나머지는 만들면서 체크리스트가 알려줘요.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link
              href="/admin/settings/setup"
              className="rounded-xl bg-black p-3.5 text-white"
            >
              <span className="block text-sm font-semibold">
                1 · 처음 설정 마법사 →
              </span>
              <span className="mt-0.5 block text-[11.5px] opacity-70">
                문자 · 결제 · 예약 · 추적을 하나씩
              </span>
            </Link>
            <Link
              href="/admin/campaigns/new"
              className="rounded-xl border border-zinc-300 p-3.5"
            >
              <span className="block text-sm font-semibold text-zinc-900">
                2 · 첫 캠페인 만들기 →
              </span>
              <span className="mt-0.5 block text-[11.5px] text-zinc-500">
                퍼널 형태를 고르면 페이지까지 한 번에
              </span>
            </Link>
          </div>
        </Card>
      )}

      {/* 지금 처리할 것 */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-bold">지금 처리할 것</p>
        {t.actions.length === 0 ? (
          <p className="py-2 text-sm text-zinc-400">
            처리할 게 없어요. 좋은 상태입니다. ✓
          </p>
        ) : (
          <ul className="space-y-1.5">
            {t.actions.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between rounded-lg border border-amber-200 px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  <span className="text-zinc-800">• {a.label}</span>
                  <span className="text-zinc-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 이번 주 */}
      <Card className="mb-6">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold">이번 주 매출 (7일)</p>
          {week.deltaPct != null && (
            <span
              className={`text-sm font-semibold ${
                week.deltaPct >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {week.deltaPct >= 0 ? "▲" : "▼"} 지난주 대비{" "}
              {Math.abs(week.deltaPct)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {won(week.revenue)}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          신규 신청 {week.newLeads} · 구매 {week.purchases} · 상담 예약{" "}
          {week.bookings}
          {week.prevRevenue > 0 && ` · 지난주 ${won(week.prevRevenue)}`}
        </p>
      </Card>

      {/* 캠페인별 */}
      <Card>
        <p className="mb-3 text-sm font-bold">캠페인</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {t.campaigns.length === 0 && (
            <p className="text-sm text-zinc-400">캠페인 없음</p>
          )}
          {t.campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}`}
              className="rounded-xl border border-zinc-200 p-3.5 transition hover:border-zinc-400"
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-zinc-900">
                  {c.name}
                </span>
                <Tag tone={c.status === "live" ? "green" : "amber"}>
                  {c.status === "live" ? "발행" : "임시"}
                </Tag>
                {c.isDefault && <Tag tone="gray">기본</Tag>}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                신청 {c.leads} · 구매 {c.purchases} · 매출 {won(c.revenue)}
              </p>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
