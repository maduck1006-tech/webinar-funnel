import Link from "next/link";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { messageAutomations, messageAutomationSteps } from "@/db/schema";
import { Card, PageHeader } from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import { cloneForCampaign, createAutomation, toggleAutomation } from "./actions";
import {
  automationSummary,
  MiniTimeline,
  ToggleSwitch,
  TRIGGER_META,
} from "./_ui";

export const dynamic = "force-dynamic";

/** 다른 파일(에디터)에서도 씀 — 기존 이름 유지 */
export const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TRIGGER_META).map(([k, v]) => [k, v.label]),
);

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignId } = await searchParams;

  let campaignOptions: Awaited<ReturnType<typeof listCampaigns>> = [];
  let rows: {
    a: typeof messageAutomations.$inferSelect;
    steps: (typeof messageAutomationSteps.$inferSelect)[];
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
      autos.map(async (a) => ({
        a,
        steps: await db
          .select()
          .from(messageAutomationSteps)
          .where(eq(messageAutomationSteps.automationId, a.id))
          .orderBy(asc(messageAutomationSteps.stepOrder)),
      })),
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

  function AutomationCard({ a, steps }: (typeof rows)[number]) {
    const meta = TRIGGER_META[a.trigger];
    const enabledSteps = steps.filter((s) => s.enabled);
    return (
      <div
        className={`flex flex-col gap-3 rounded-xl border p-4 transition sm:flex-row sm:items-center ${
          a.enabled ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 text-2xl leading-none">{meta?.icon ?? "✉️"}</span>
          <div className="min-w-0">
            <Link
              href={`/admin/automation/${a.id}`}
              className="font-semibold text-zinc-900 hover:underline"
            >
              {a.name}
            </Link>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500">
              {automationSummary(a.trigger, steps.length, a.stopOn ?? [])}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 pl-9 sm:pl-0">
          <MiniTimeline delays={enabledSteps.map((s) => s.delayMinutes)} />
          <form action={toggleAutomation}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="next" value={String(!a.enabled)} />
            <ToggleSwitch on={a.enabled} />
          </form>
          {campaignId && !a.campaignId && (
            <form action={cloneForCampaign}>
              <input type="hidden" name="sourceId" value={a.id} />
              <input type="hidden" name="campaignId" value={campaignId} />
              <button className="whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50">
                이 캠페인만 수정
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="자동 메시지"
        desc="손님이 어떤 행동을 하면, 정해둔 시간에, 문자가 저절로 나가도록 만드는 곳이에요."
        actions={<CampaignFilter options={campaignOptions} />}
      />

      <SectionTabs set="customer" />

      {/* 초보자용 설명 카드 */}
      <Card className="mb-6 !bg-zinc-900 text-white">
        <p className="text-sm font-bold">💡 처음이신가요? 이렇게 동작해요</p>
        <div className="mt-3 grid gap-3 text-[12.5px] leading-relaxed sm:grid-cols-3">
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-lg">1️⃣ 👤</p>
            <p className="mt-1 font-semibold">손님이 행동합니다</p>
            <p className="mt-0.5 text-white/70">
              무료 신청 · 강의 시청 · 결제 · 상담 예약 중 하나
            </p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-lg">2️⃣ ⏱️</p>
            <p className="mt-1 font-semibold">정해둔 시간이 지납니다</p>
            <p className="mt-0.5 text-white/70">
              바로 · 30분 뒤 · 1일 뒤처럼 자유롭게 정할 수 있어요
            </p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-lg">3️⃣ 💬</p>
            <p className="mt-1 font-semibold">문자가 자동으로 나갑니다</p>
            <p className="mt-0.5 text-white/70">
              한 번 만들어두면 사람이 계속 안 눌러도 계속 나가요
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-white/60">
          아래 목록의 각 항목이 &quot;자동 메시지&quot; 하나입니다. 이름을 눌러
          들어가면 문자를 하나씩 추가·수정할 수 있어요.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <p className="mb-3 text-sm font-bold">
              🌐 기본으로 켜져 있는 자동 메시지
              {campaignId ? " (이 캠페인에도 적용 중)" : " · 모든 캠페인 공통"}
            </p>
            <div className="space-y-2.5">
              {globals.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-400">
                  기본 자동화가 없습니다.
                </p>
              )}
              {globals.map((r) => (
                <AutomationCard key={r.a.id} {...r} />
              ))}
            </div>
          </Card>

          {campaignId && (
            <Card>
              <p className="mb-3 text-sm font-bold">📌 이 캠페인만의 자동 메시지</p>
              <div className="space-y-2.5">
                {campaignRows.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-400">
                    아직 없어요. 위 목록에서 <b>&quot;이 캠페인만 수정&quot;</b>을
                    누르거나, 오른쪽에서 새로 만들어보세요.
                  </p>
                )}
                {campaignRows.map((r) => (
                  <AutomationCard key={r.a.id} {...r} />
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <p className="mb-1 text-sm font-bold">➕ 새 자동 메시지 만들기</p>
          <p className="mb-3 text-[12px] text-zinc-500">
            이름은 관리용이라 손님에게 안 보여요. 자유롭게 지으세요.
          </p>
          <form action={createAutomation} className="space-y-3 text-sm">
            {campaignId && (
              <input type="hidden" name="campaignId" value={campaignId} />
            )}
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">이름</span>
              <input
                name="name"
                required
                placeholder="예: 신청 후 5일 스토리"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">
                손님이 언제 이 흐름에 들어오나요?
              </span>
              <select
                name="trigger"
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                {Object.entries(TRIGGER_META).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="w-full rounded-lg bg-black py-2.5 font-semibold text-white hover:bg-zinc-800">
              만들고 문자 추가하러 가기 →
            </button>
          </form>
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-800">
            🕒 문자는 <b>15분마다</b> 자동으로 확인해서 보낼 시간이 된 것만
            나갑니다. &quot;바로&quot;로 설정하면 그 행동 즉시 나가요.
          </div>
        </Card>
      </div>
    </>
  );
}
