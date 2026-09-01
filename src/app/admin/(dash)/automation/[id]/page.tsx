import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  messageAutomations,
  messageAutomationSteps,
} from "@/db/schema";
import { Card, PageHeader, Tag } from "@/components/admin-ui";
import {
  addStep,
  deleteAutomation,
  deleteStep,
  removeCampaignOverride,
  toggleAutomation,
  updateAutomation,
  updateStep,
} from "../actions";
import { TRIGGER_LABEL } from "../page";

export const dynamic = "force-dynamic";

const AUDIENCE_OPTS = [
  ["all", "전원"],
  ["not_watched", "아직 강의 안 본 사람만"],
  ["not_purchased", "아직 결제 안 한 사람만"],
  ["not_booked", "아직 상담 예약 안 한 사람만"],
] as const;

const VARS = "{이름} {링크} {예약링크} {결제링크} {상품명} {마감시각} {다운로드링크}";

function humanDelay(min: number) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts = [d && `${d}일`, h && `${h}시간`, m && `${m}분`].filter(Boolean);
  return parts.length ? `${parts.join(" ")} 뒤` : "시작 즉시";
}

export default async function AutomationEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [auto] = await db
    .select()
    .from(messageAutomations)
    .where(eq(messageAutomations.id, id));
  if (!auto) notFound();

  const steps = await db
    .select()
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, id))
    .orderBy(asc(messageAutomationSteps.stepOrder));

  let campaignName: string | null = null;
  if (auto.campaignId) {
    const [c] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, auto.campaignId));
    campaignName = c?.name ?? null;
  }
  const stop = new Set(auto.stopOn ?? []);

  return (
    <>
      <PageHeader
        title={auto.name}
        desc={
          <span className="flex items-center gap-2">
            <Link href="/admin/automation" className="text-blue-600 underline">
              ← 자동 메시지 목록
            </Link>
            {campaignName ? (
              <Tag tone="blue">캠페인 전용: {campaignName}</Tag>
            ) : (
              <Tag tone="gray">전역 기본</Tag>
            )}
            {auto.key && <span className="text-[11px] text-zinc-400">({auto.key})</span>}
          </span>
        }
      />

      <div className="space-y-6">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">기본 설정</p>
            <form action={toggleAutomation}>
              <input type="hidden" name="id" value={auto.id} />
              <input type="hidden" name="next" value={String(!auto.enabled)} />
              <button className="flex items-center gap-1.5 text-xs">
                <Tag tone={auto.enabled ? "green" : "gray"}>
                  {auto.enabled ? "켜짐" : "꺼짐"}
                </Tag>
                <span className="text-zinc-500 underline">
                  {auto.enabled ? "끄기" : "켜기"}
                </span>
              </button>
            </form>
          </div>
          <form action={updateAutomation} className="space-y-3 text-sm">
            <input type="hidden" name="id" value={auto.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-zinc-500">이름</span>
                <input
                  name="name"
                  defaultValue={auto.name}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-500">언제 시작?</span>
                <select
                  name="trigger"
                  defaultValue={auto.trigger}
                  className="mt-1 w-full rounded border px-2 py-1"
                >
                  {Object.entries(TRIGGER_LABEL).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="rounded-lg border p-3">
              <legend className="px-1 text-xs text-zinc-500">
                이 이벤트가 생기면 남은 문자 중단 (김빠진 문자 방지)
              </legend>
              {[
                ["stop_purchase", "purchase", "결제하면"],
                ["stop_booking", "booking", "상담 예약하면"],
                ["stop_watch_start", "watch_start", "강의 보기 시작하면"],
              ].map(([n, key, label]) => (
                <label key={n} className="mr-4 inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name={n}
                    defaultChecked={stop.has(key)}
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </fieldset>
            <button className="rounded-lg bg-black px-4 py-2 font-semibold text-white">
              설정 저장
            </button>
          </form>
        </Card>

        <div className="space-y-3">
          {steps.length === 0 && (
            <Card>
              <p className="text-sm text-zinc-500">
                아직 문자가 없습니다. 아래 &quot;문자 추가&quot;를 누르세요.
              </p>
            </Card>
          )}

          {steps.map((step, i) => (
            <Card key={step.id}>
              <form action={updateStep} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="automationId" value={auto.id} />

                <div className="flex items-center justify-between">
                  <p className="font-bold">
                    문자 {i + 1}
                    <span className="ml-1 text-xs font-normal text-zinc-400">
                      · {humanDelay(step.delayMinutes)}
                    </span>
                  </p>
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={step.enabled}
                    />
                    보내기
                  </label>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {(
                    [
                      ["days", "일", Math.floor(step.delayMinutes / 1440)],
                      [
                        "hours",
                        "시간",
                        Math.floor((step.delayMinutes % 1440) / 60),
                      ],
                      ["mins", "분", step.delayMinutes % 60],
                    ] as const
                  ).map(([n, unit, val]) => (
                    <label key={n} className="block">
                      <span className="text-[11px] text-zinc-400">{unit}</span>
                      <input
                        name={n}
                        type="number"
                        min={0}
                        defaultValue={val}
                        className="mt-1 w-16 rounded border px-2 py-1"
                      />
                    </label>
                  ))}
                  <span className="pb-1.5 text-[11px] text-zinc-400">뒤에</span>
                  <label className="block flex-1">
                    <span className="text-[11px] text-zinc-400">누구에게</span>
                    <select
                      name="audience"
                      defaultValue={step.audience}
                      className="mt-1 w-full rounded border px-2 py-1"
                    >
                      {AUDIENCE_OPTS.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-[11px] text-zinc-400">문자 내용</span>
                  <textarea
                    name="body"
                    defaultValue={step.body}
                    rows={4}
                    placeholder={`변수: ${VARS}`}
                    className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-400">
                    변수: {VARS} — 발송 시 자동으로 채워집니다
                  </span>
                </label>

                <div className="flex gap-2">
                  <button className="rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white">
                    이 문자 저장
                  </button>
                  <button
                    formAction={deleteStep}
                    className="rounded-lg border px-3 py-1.5 text-xs text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </form>
            </Card>
          ))}

          <form action={addStep}>
            <input type="hidden" name="automationId" value={auto.id} />
            <button className="w-full rounded-lg border-2 border-dashed py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-50">
              + 문자 추가
            </button>
          </form>
        </div>

        <Card>
          {auto.campaignId ? (
            <form action={removeCampaignOverride}>
              <input type="hidden" name="id" value={auto.id} />
              <button className="text-xs text-red-600 underline">
                이 캠페인 전용 설정 삭제 → 전역 기본값으로 복귀
              </button>
            </form>
          ) : auto.key ? (
            <p className="text-xs text-zinc-400">
              시스템 기본 자동화입니다. 삭제 대신 끄기를 사용하세요.
            </p>
          ) : (
            <form action={deleteAutomation}>
              <input type="hidden" name="id" value={auto.id} />
              <button className="text-xs text-red-600 underline">
                이 자동 메시지 삭제
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
