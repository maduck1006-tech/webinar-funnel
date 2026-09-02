import { db } from "@/db";
import { affiliates } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  EmptyRow,
  PageHeader,
  Tag,
  won,
} from "@/components/admin-ui";
import { listAffiliatesWithStats } from "@/lib/affiliates";
import { SectionTabs } from "../SectionTabs";
import { markCommissionPaid, saveAffiliate, toggleAffiliate } from "./actions";

export const dynamic = "force-dynamic";

function siteOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://class.launchscale.kr")
  );
}

export default async function AffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  let list: Awaited<ReturnType<typeof listAffiliatesWithStats>> = [];
  try {
    list = await listAffiliatesWithStats();
  } catch {
    /* db 미연결 */
  }
  let editing: typeof affiliates.$inferSelect | null = null;
  if (edit) {
    const [e] = await db.select().from(affiliates).where(eq(affiliates.id, edit));
    editing = e ?? null;
  }
  const origin = siteOrigin();

  return (
    <>
      <PageHeader
        title="어필리에이트"
        desc="추천 링크(?ref=코드)로 들어온 고객이 결제하면 커미션이 자동 집계됩니다"
      />

      <SectionTabs set="revenue" />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-400">
                <th className="py-2">이름 / 코드</th>
                <th className="py-2">추천 링크</th>
                <th className="py-2 text-right">추천</th>
                <th className="py-2 text-right">주문</th>
                <th className="py-2 text-right">매출</th>
                <th className="py-2 text-right">커미션(미지급)</th>
                <th className="py-2">상태</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.length === 0 && (
                <EmptyRow colSpan={8} text="등록된 어필리에이트 없음" />
              )}
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">
                    <div className="font-semibold">{a.name}</div>
                    <div className="font-mono text-xs text-zinc-400">
                      {a.code} · {a.commissionPct}%
                    </div>
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    <code>{`${origin}/?ref=${a.code}`}</code>
                  </td>
                  <td className="py-2 text-right">{a.referrals}</td>
                  <td className="py-2 text-right">{a.orderCount}</td>
                  <td className="py-2 text-right">{won(a.sales)}</td>
                  <td className="py-2 text-right">
                    {won(a.commission)}
                    {a.unpaid > 0 && (
                      <span className="ml-1 text-xs text-amber-600">
                        ({won(a.unpaid)})
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <Tag tone={a.status === "active" ? "green" : "gray"}>
                      {a.status === "active" ? "활성" : "중지"}
                    </Tag>
                  </td>
                  <td className="py-2 text-right text-xs">
                    <a
                      href={`/admin/affiliates?edit=${a.id}`}
                      className="mr-2 text-blue-600 underline"
                    >
                      수정
                    </a>
                    <form action={toggleAffiliate} className="inline">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(a.status !== "active")}
                      />
                      <button className="mr-2 text-zinc-500 underline">
                        {a.status === "active" ? "중지" : "활성"}
                      </button>
                    </form>
                    {a.unpaid > 0 && (
                      <form action={markCommissionPaid} className="inline">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-emerald-600 underline">
                          지급완료
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-bold">
            {editing ? "어필리에이트 수정" : "새 어필리에이트"}
          </p>
          <form action={saveAffiliate} className="space-y-2.5 text-sm">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="block">
              <span className="text-xs text-zinc-500">이름 / 파트너명</span>
              <input
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">
                추천 코드 (영문·숫자·-_ , 2~32자)
              </span>
              <input
                name="code"
                defaultValue={editing?.code ?? ""}
                placeholder="jinsu"
                required
                className="mt-1 w-full rounded border px-2 py-1 font-mono lowercase"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">커미션 %</span>
              <input
                name="commissionPct"
                defaultValue={editing?.commissionPct?.toString() ?? "20"}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">연락처 (선택)</span>
                <input
                  name="phone"
                  defaultValue={editing?.phone ?? ""}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">이메일 (선택)</span>
                <input
                  name="email"
                  defaultValue={editing?.email ?? ""}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-zinc-500">
                정산 정보 (계좌 등 · 선택)
              </span>
              <input
                name="payoutInfo"
                defaultValue={editing?.payoutInfo ?? ""}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <button className="mt-1 w-full rounded-lg bg-black py-2 font-semibold text-white">
              {editing ? "저장" : "만들기"}
            </button>
            {editing && (
              <a
                href="/admin/affiliates"
                className="block pt-1 text-center text-xs text-zinc-500 underline"
              >
                취소
              </a>
            )}
          </form>
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            추천 귀속은 first-touch(첫 클릭) 기준이며 90일 유지됩니다. 커미션은
            결제 완료 시점의 결제 금액 × 커미션%로 계산됩니다.
          </p>
        </Card>
      </div>
    </>
  );
}
