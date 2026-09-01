import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  messageSequences,
  sequenceEnrollments,
  sequenceSteps,
} from "@/db/schema";
import { Card, EmptyRow, PageHeader, Tag } from "@/components/admin-ui";
import { listCampaigns } from "@/lib/campaign";
import { createSequence, toggleSequence } from "./actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  signup: "무료 신청했을 때",
  purchase: "결제했을 때",
  booking: "상담 예약했을 때",
  manual: "직접 등록",
};

export default async function SequencesPage() {
  let rows: {
    seq: typeof messageSequences.$inferSelect;
    steps: number;
    active: number;
  }[] = [];
  let campaigns: { id: string; name: string }[] = [];
  try {
    const seqs = await db
      .select()
      .from(messageSequences)
      .orderBy(asc(messageSequences.createdAt));
    rows = await Promise.all(
      seqs.map(async (seq) => {
        const [{ c: steps } = { c: 0 }] = await db
          .select({ c: count() })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, seq.id));
        const [{ c: active } = { c: 0 }] = await db
          .select({ c: count() })
          .from(sequenceEnrollments)
          .where(
            sql`${sequenceEnrollments.sequenceId} = ${seq.id} and ${sequenceEnrollments.status} = 'active'`,
          );
        return { seq, steps: Number(steps), active: Number(active) };
      }),
    );
    campaigns = await listCampaigns();
  } catch {
    /* DB 미연결 */
  }

  return (
    <>
      <PageHeader
        title="문자 시퀀스"
        desc="신청·결제·예약 이후 며칠에 걸쳐 자동으로 나가는 문자 흐름을 만듭니다"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-500">
                <th className="pb-2">이름</th>
                <th className="pb-2">시작 시점</th>
                <th className="pb-2">문자 수</th>
                <th className="pb-2">진행 중</th>
                <th className="pb-2">상태</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <EmptyRow colSpan={6} text="아직 만든 시퀀스가 없습니다" />
              )}
              {rows.map(({ seq, steps, active }) => (
                <tr key={seq.id}>
                  <td className="py-2 font-medium">
                    <Link
                      href={`/admin/sequences/${seq.id}`}
                      className="text-blue-600 underline"
                    >
                      {seq.name}
                    </Link>
                    {!seq.campaignId && (
                      <span className="ml-1 text-[10px] text-zinc-400">전역</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    {EVENT_LABEL[seq.enrollEvent] ?? seq.enrollEvent}
                  </td>
                  <td className="py-2">{steps}개</td>
                  <td className="py-2">{active}명</td>
                  <td className="py-2">
                    <Tag tone={seq.enabled ? "green" : "gray"}>
                      {seq.enabled ? "켜짐" : "꺼짐"}
                    </Tag>
                  </td>
                  <td className="py-2 text-right">
                    <form action={toggleSequence} className="inline">
                      <input type="hidden" name="id" value={seq.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(!seq.enabled)}
                      />
                      <button className="text-xs text-zinc-500 underline">
                        {seq.enabled ? "끄기" : "켜기"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-bold">새 시퀀스 만들기</p>
          <form action={createSequence} className="space-y-3 text-sm">
            <label className="block">
              <span className="text-xs text-zinc-500">이름 (나만 봄)</span>
              <input
                name="name"
                required
                placeholder="예: 신청 후 5일 스토리"
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>

            <fieldset className="rounded-lg border p-3">
              <legend className="px-1 text-xs text-zinc-500">
                언제 시작할까요?
              </legend>
              {(
                [
                  ["signup", "무료 신청했을 때", "웜업·스토리텔링에 사용"],
                  ["purchase", "결제했을 때", "구매자 온보딩·후속 오퍼"],
                  ["booking", "상담 예약했을 때", "노쇼 방지·사전 안내"],
                  ["manual", "직접 등록", "CRM에서 특정 고객만 골라 넣기"],
                ] as const
              ).map(([v, t, d], i) => (
                <label
                  key={v}
                  className="mt-1.5 flex cursor-pointer items-start gap-2"
                >
                  <input
                    type="radio"
                    name="enrollEvent"
                    value={v}
                    defaultChecked={i === 0}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm">{t}</span>
                    <span className="block text-[11px] text-zinc-400">{d}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="block">
              <span className="text-xs text-zinc-500">
                어느 캠페인? (비우면 전체 공통)
              </span>
              <select
                name="campaignId"
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="">전체 공통 (전역)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <button className="w-full rounded-lg bg-black py-2 font-semibold text-white">
              만들고 문자 추가하기
            </button>
          </form>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
            만든 뒤 &quot;문자 1 / 문자 2 …&quot;를 추가하면서 각각 <b>며칠 뒤</b>,
            <b> 누구에게</b>, <b>무슨 내용</b>인지 채우면 됩니다. 크론이 15분마다
            발송 대상을 확인합니다.
          </p>
        </Card>
      </div>
    </>
  );
}
