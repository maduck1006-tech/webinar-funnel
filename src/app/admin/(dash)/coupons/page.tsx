import { desc } from "drizzle-orm";
import { db } from "@/db";
import { coupons, type Coupon } from "@/db/schema";
import { Card, EmptyRow, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { deleteCoupon, saveCoupon, toggleCoupon } from "./actions";

export const dynamic = "force-dynamic";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  let list: Coupon[] = [];
  try {
    list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  } catch {
    /* db 미연결 */
  }
  const editing = list.find((c) => c.id === edit) ?? null;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");

  return (
    <>
      <PageHeader
        title="쿠폰"
        desc="결제창에서 '프로모션 코드'로 입력받는 할인 코드입니다"
      />

      <SectionTabs set="product" />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-400">
                <th className="py-2">코드</th>
                <th className="py-2">할인</th>
                <th className="py-2">사용</th>
                <th className="py-2">기간</th>
                <th className="py-2">상태</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.length === 0 && <EmptyRow colSpan={6} text="쿠폰 없음" />}
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-mono font-semibold">{c.code}</td>
                  <td className="py-2">
                    {c.type === "percent"
                      ? `${c.value}%`
                      : won(c.value)}
                    {c.minAmount ? (
                      <span className="ml-1 text-xs text-zinc-400">
                        ({won(c.minAmount)}↑)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    {c.redeemedCount}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    {c.startsAt || c.endsAt
                      ? `${fmtDate(c.startsAt)} ~ ${fmtDate(c.endsAt)}`
                      : "상시"}
                  </td>
                  <td className="py-2">
                    <Tag tone={c.active ? "green" : "gray"}>
                      {c.active ? "사용중" : "중지"}
                    </Tag>
                  </td>
                  <td className="py-2 text-right text-xs">
                    <a
                      href={`/admin/coupons?edit=${c.id}`}
                      className="mr-2 text-blue-600 underline"
                    >
                      수정
                    </a>
                    <form action={toggleCoupon} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(!c.active)}
                      />
                      <button className="mr-2 text-zinc-500 underline">
                        {c.active ? "중지" : "사용"}
                      </button>
                    </form>
                    <form action={deleteCoupon} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-red-500 underline">삭제</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-bold">
            {editing ? "쿠폰 수정" : "새 쿠폰"}
          </p>
          <form action={saveCoupon} className="space-y-2.5 text-sm">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <label className="block">
              <span className="text-xs text-zinc-500">코드 (대문자·숫자)</span>
              <input
                name="code"
                defaultValue={editing?.code ?? ""}
                placeholder="WELCOME10"
                required
                className="mt-1 w-full rounded border px-2 py-1 font-mono uppercase"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">관리용 이름 (선택)</span>
              <input
                name="name"
                defaultValue={editing?.name ?? ""}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">종류</span>
                <select
                  name="type"
                  defaultValue={editing?.type ?? "percent"}
                  className="mt-1 w-full rounded border px-2 py-1"
                >
                  <option value="percent">% 할인</option>
                  <option value="fixed">정액 할인 (원)</option>
                </select>
              </label>
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">값</span>
                <input
                  name="value"
                  defaultValue={editing?.value?.toString() ?? ""}
                  placeholder="10"
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">최소 주문액 (선택)</span>
                <input
                  name="minAmount"
                  defaultValue={editing?.minAmount?.toString() ?? ""}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">총 사용 한도 (선택)</span>
                <input
                  name="maxRedemptions"
                  defaultValue={editing?.maxRedemptions?.toString() ?? ""}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">시작 (선택)</span>
                <input
                  type="datetime-local"
                  name="startsAt"
                  defaultValue={iso(editing?.startsAt ?? null)}
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                />
              </label>
              <label className="block flex-1">
                <span className="text-xs text-zinc-500">종료 (선택)</span>
                <input
                  type="datetime-local"
                  name="endsAt"
                  defaultValue={iso(editing?.endsAt ?? null)}
                  className="mt-1 w-full rounded border px-2 py-1 text-xs"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing ? editing.active : true}
              />
              <span className="text-xs">지금 사용 가능</span>
            </label>
            <button className="mt-1 w-full rounded-lg bg-black py-2 font-semibold text-white">
              {editing ? "저장" : "만들기"}
            </button>
          </form>
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            한 번 결제한 고객은 같은 쿠폰을 다시 못 씁니다. 상품 전체에
            적용되며, 오더범프 금액까지 포함해 계산됩니다.
          </p>
        </Card>
      </div>
    </>
  );
}
