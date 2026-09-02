import { desc } from "drizzle-orm";
import { db } from "@/db";
import { broadcasts, campaigns, products } from "@/db/schema";
import { Card, EmptyRow, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { ConfirmSubmit } from "../form-ui";
import { countSegment } from "@/lib/broadcasts";
import { BroadcastComposer } from "./BroadcastComposer";
import { deleteBroadcast } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "gray" | "blue" }> = {
  draft: { label: "임시", tone: "gray" },
  scheduled: { label: "예약됨", tone: "blue" },
  sending: { label: "발송 중", tone: "amber" },
  sent: { label: "완료", tone: "green" },
};

export default async function BroadcastsPage() {
  const [list, camps, prods, initialCount] = await Promise.all([
    db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).catch(() => []),
    db
      .select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .orderBy(campaigns.name)
      .catch(() => []),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .orderBy(products.name)
      .catch(() => []),
    countSegment({}).catch(() => 0),
  ]);

  return (
    <>
      <PageHeader
        title="브로드캐스트"
        desc="세그먼트에 한 번 쏘는 문자 (자동 드립 아님). 프로모·공지·재활성화에 사용"
      />

      <SectionTabs set="customer" />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <p className="mb-3 text-sm font-bold">보낸 내역</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-400">
                <th className="py-2">이름</th>
                <th className="py-2">상태</th>
                <th className="py-2">발송</th>
                <th className="py-2">일시</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.length === 0 && <EmptyRow colSpan={5} text="보낸 브로드캐스트 없음" />}
              {list.map((b) => {
                const st = STATUS[b.status] ?? STATUS.draft;
                return (
                  <tr key={b.id}>
                    <td className="py-2 font-medium">{b.name}</td>
                    <td className="py-2">
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </td>
                    <td className="py-2 text-xs text-zinc-500">
                      {b.sentCount}
                      {b.failedCount > 0 && ` (실패 ${b.failedCount})`}
                    </td>
                    <td className="py-2 text-xs text-zinc-500">
                      {b.scheduledAt && b.status === "scheduled"
                        ? `예약 ${fmtDate(b.scheduledAt)}`
                        : fmtDate(b.sentAt ?? b.createdAt)}
                    </td>
                    <td className="py-2 text-right">
                      <form action={deleteBroadcast} className="inline">
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmit
                          message="이 브로드캐스트를 삭제할까요? 되돌릴 수 없습니다."
                          className="text-xs text-red-500 underline"
                        >
                          삭제
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-bold">새 브로드캐스트</p>
          <BroadcastComposer
            campaigns={camps}
            products={prods}
            initialCount={initialCount}
          />
        </Card>
      </div>
    </>
  );
}
