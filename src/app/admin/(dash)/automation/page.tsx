import Link from "next/link";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { messageAutomations, messageAutomationSteps } from "@/db/schema";
import { Card, EmptyRow, PageHeader, Tag } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import { cloneForCampaign, createAutomation, toggleAutomation } from "./actions";

export const dynamic = "force-dynamic";

export const TRIGGER_LABEL: Record<string, string> = {
  signup: "무료 신청했을 때",
  watch_start: "강의 시청을 시작했을 때",
  purchase: "결제했을 때",
  booking: "상담 예약했을 때",
  manual: "직접 등록",
};

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignId } = await searchParams;

  let campaignOptions: Awaited<ReturnType<typeof listCampaigns>> = [];
  let rows: {
    a: typeof messageAutomations.$inferSelect;
    steps: number;
  }[] = [];
  try {
    campaignOptions = await listCampaigns();
    const autos = await db
      .select()
      .from(messageAutomations)
      .where(
        campaignId
          ? or(
              eq(messageAutomations.campaignId, campaignId),
              isNull(messageAutomations.campaignId),
            )
          : isNull(messageAutomations.campaignId),
      )
      .orderBy(asc(messageAutomations.createdAt));
    rows = await Promise.all(
      autos.map(async (a) => {
        const [{ c } = { c: 0 }] = await db
          .select({ c: count() })
          .from(messageAutomationSteps)
          .where(eq(messageAutomationSteps.automationId, a.id));
        return { a, steps: Number(c) };
      }),
    );
  } catch {
    /* DB 미연결 */
  }

  // key 별로 캠페인 전용본이 전역 기본을 덮어씀
  const overriddenKeys = new Set(
    rows.filter((r) => r.a.campaignId && r.a.key).map((r) => r.a.key),
  );
  const globals = rows.filter(
    (r) => !r.a.campaignId && !(r.a.key && overriddenKeys.has(r.a.key)),
  );
  const campaignRows = rows.filter((r) => r.a.campaignId);

  function Row({ a, steps }: (typeof rows)[number]) {
    return (
      <tr>
        <td className="py-2 font-medium">
          <Link
            href={`/admin/automation/${a.id}`}
            className="text-blue-600 underline"
          >
            {a.name}
          </Link>
        </td>
        <td className="py-2 text-xs text-zinc-500">
          {TRIGGER_LABEL[a.trigger] ?? a.trigger}
        </td>
        <td className="py-2">문자 {steps}개</td>
        <td className="py-2">
          <Tag tone={a.enabled ? "green" : "gray"}>
            {a.enabled ? "켜짐" : "꺼짐"}
          </Tag>
        </td>
        <td className="py-2 text-right">
          <form action={toggleAutomation} className="inline">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="next" value={String(!a.enabled)} />
            <button className="text-xs text-zinc-500 underline">
              {a.enabled ? "끄기" : "켜기"}
            </button>
          </form>
          {campaignId && !a.campaignId && (
            <form action={cloneForCampaign} className="ml-2 inline">
              <input type="hidden" name="sourceId" value={a.id} />
              <input type="hidden" name="campaignId" value={campaignId} />
              <button className="text-xs text-blue-600 underline">
                이 캠페인만 수정
              </button>
            </form>
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      <PageHeader
        title="자동 메시지"
        desc="신청·시청·결제·예약 이후 자동으로 나가는 문자. 캠페인을 고르면 캠페인별로 덮어쓸 수 있습니다."
        actions={<CampaignFilter options={campaignOptions} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="overflow-x-auto">
            <p className="mb-2 text-sm font-bold">
              시스템 기본{campaignId ? " (이 캠페인에 적용 중)" : " (모든 캠페인)"}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500">
                  <th className="pb-2">이름</th>
                  <th className="pb-2">시작 시점</th>
                  <th className="pb-2">문자</th>
                  <th className="pb-2">상태</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {globals.length === 0 && (
                  <EmptyRow colSpan={5} text="기본 자동화 없음 (마이그레이션 필요)" />
                )}
                {globals.map((r) => (
                  <Row key={r.a.id} {...r} />
                ))}
              </tbody>
            </table>
          </Card>

          {campaignId && (
            <Card className="overflow-x-auto">
              <p className="mb-2 text-sm font-bold">이 캠페인 전용</p>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {campaignRows.length === 0 && (
                    <EmptyRow
                      colSpan={5}
                      text="캠페인 전용 자동화 없음 — 위에서 '이 캠페인만 수정' 또는 오른쪽에서 새로 추가"
                    />
                  )}
                  {campaignRows.map((r) => (
                    <Row key={r.a.id} {...r} />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <Card>
          <p className="mb-3 text-sm font-bold">새 자동 메시지</p>
          <form action={createAutomation} className="space-y-3 text-sm">
            {campaignId && (
              <input type="hidden" name="campaignId" value={campaignId} />
            )}
            <label className="block">
              <span className="text-xs text-zinc-500">이름 (나만 봄)</span>
              <input
                name="name"
                required
                placeholder="예: 신청 후 5일 스토리"
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">언제 시작?</span>
              <select
                name="trigger"
                className="mt-1 w-full rounded border px-2 py-1"
              >
                {Object.entries(TRIGGER_LABEL).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button className="w-full rounded-lg bg-black py-2 font-semibold text-white">
              만들고 문자 추가하기
            </button>
          </form>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
            만든 뒤 &quot;문자 1 / 문자 2 …&quot;를 추가하며 각각{" "}
            <b>며칠 뒤 · 누구에게 · 무슨 내용</b>인지 채우면 됩니다. 크론이 15분마다
            발송 대상을 확인합니다. (시작 즉시 = 0분 뒤로 설정)
          </p>
        </Card>
      </div>
    </>
  );
}
