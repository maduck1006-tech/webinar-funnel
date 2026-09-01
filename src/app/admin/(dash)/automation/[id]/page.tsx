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
import {
  AUDIENCE_META,
  automationSummary,
  CheckboxToggle,
  humanDelay,
  PhoneBubble,
  previewText,
  STOP_META,
  ToggleSwitch,
  TRIGGER_META,
} from "../_ui";

export const dynamic = "force-dynamic";

const VARS: { name: string; desc: string }[] = [
  { name: "{이름}", desc: "손님 이름" },
  { name: "{링크}", desc: "강의 시청 링크" },
  { name: "{예약링크}", desc: "상담 예약 페이지" },
  { name: "{결제링크}", desc: "결제 페이지" },
  { name: "{단톡방링크}", desc: "무료 단톡방 초대" },
  { name: "{세일즈링크}", desc: "전자책/강의/상담 세일즈 페이지" },
  { name: "{상품명}", desc: "연결된 상품 이름" },
  { name: "{마감시각}", desc: "시청 마감 시각" },
  { name: "{다운로드링크}", desc: "자료 다운로드 링크" },
];

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
  const trigMeta = TRIGGER_META[auto.trigger];

  return (
    <>
      <PageHeader
        title={`${trigMeta?.icon ?? "✉️"}  ${auto.name}`}
        desc={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/automation" className="text-blue-600 underline">
              ← 자동 메시지 목록
            </Link>
            {campaignName ? (
              <Tag tone="blue">캠페인 전용: {campaignName}</Tag>
            ) : (
              <Tag tone="gray">모든 캠페인 공통</Tag>
            )}
          </span>
        }
      />

      {/* 요약 문장 */}
      <div className="mb-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
        📣 {automationSummary(auto.trigger, steps.length, auto.stopOn ?? [])}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* ── 타임라인 ── */}
          <div className="relative pl-7">
            {/* 세로선 */}
            <div className="absolute left-[13px] top-2 bottom-2 w-px bg-zinc-200" />

            {steps.length === 0 && (
              <Card className="mb-4">
                <p className="text-sm text-zinc-500">
                  아직 보낼 문자가 없어요. 아래 <b>&quot;+ 문자 추가&quot;</b>를
                  눌러 첫 문자를 만들어보세요.
                </p>
              </Card>
            )}

            {steps.map((step, i) => {
              const aud = AUDIENCE_META[step.audience];
              return (
                <div key={step.id} className="relative mb-4">
                  {/* 타임라인 점 */}
                  <div className="absolute -left-7 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--fn-accent,#ff3d2e)] text-[11px] font-bold text-white">
                    {i + 1}
                  </div>

                  <Card className={!step.enabled ? "opacity-50" : ""}>
                    <form action={updateStep} className="space-y-4 text-sm">
                      <input type="hidden" name="id" value={step.id} />
                      <input type="hidden" name="automationId" value={auto.id} />

                      <div className="flex items-center justify-between">
                        <p className="font-bold text-zinc-900">
                          문자 {i + 1}{" "}
                          <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-normal text-zinc-500">
                            {humanDelay(step.delayMinutes)}
                          </span>
                        </p>
                        <CheckboxToggle
                          name="enabled"
                          defaultChecked={step.enabled}
                          label="보냄"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* 왼쪽: 타이밍 + 대상 */}
                        <div className="space-y-3">
                          <div>
                            <span className="text-xs font-medium text-zinc-600">
                              ⏱️ 언제 보낼까요?
                            </span>
                            <p className="mb-1.5 text-[11px] text-zinc-400">
                              {trigMeta?.verb ?? "시작"}시점 기준
                            </p>
                            <div className="flex items-center gap-1.5">
                              {(
                                [
                                  [
                                    "days",
                                    "일",
                                    Math.floor(step.delayMinutes / 1440),
                                  ],
                                  [
                                    "hours",
                                    "시간",
                                    Math.floor((step.delayMinutes % 1440) / 60),
                                  ],
                                  ["mins", "분", step.delayMinutes % 60],
                                ] as const
                              ).map(([n, unit, val]) => (
                                <label key={n} className="flex items-center gap-1">
                                  <input
                                    name={n}
                                    type="number"
                                    min={0}
                                    defaultValue={val}
                                    className="w-12 rounded border px-1.5 py-1 text-center"
                                  />
                                  <span className="text-[11px] text-zinc-400">
                                    {unit}
                                  </span>
                                </label>
                              ))}
                              <span className="text-[11px] text-zinc-400">뒤</span>
                            </div>
                          </div>

                          <div>
                            <span className="text-xs font-medium text-zinc-600">
                              🎯 누구에게?
                            </span>
                            <select
                              name="audience"
                              defaultValue={step.audience}
                              className="mt-1.5 w-full rounded-lg border px-2.5 py-1.5"
                            >
                              {Object.entries(AUDIENCE_META).map(([v, m]) => (
                                <option key={v} value={v}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            {aud && (
                              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                                예: {aud.example}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 오른쪽: 내용 + 미리보기 */}
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-zinc-600">
                            💬 문자 내용
                          </span>
                          <StepBodyField id={step.id} defaultValue={step.body} />
                        </div>
                      </div>

                      <div className="flex gap-2 border-t pt-3">
                        <button className="rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800">
                          이 문자 저장
                        </button>
                        <button
                          formAction={deleteStep}
                          className="rounded-lg border px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          이 문자 삭제
                        </button>
                      </div>
                    </form>
                  </Card>
                </div>
              );
            })}

            {/* 추가 버튼도 타임라인 위에 */}
            <div className="relative">
              <div className="absolute -left-7 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-[11px] text-zinc-400">
                +
              </div>
              <form action={addStep}>
                <input type="hidden" name="automationId" value={auto.id} />
                <button className="w-full rounded-xl border-2 border-dashed border-zinc-300 py-3 text-sm font-semibold text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50">
                  + 문자 추가
                </button>
              </form>
            </div>
          </div>

          {/* 변수 설명 */}
          <Card>
            <p className="mb-2 text-sm font-bold">
              🏷️ 문자 내용에 쓸 수 있는 변수
            </p>
            <p className="mb-3 text-[12px] text-zinc-500">
              중괄호 {"{ }"}로 감싼 부분은 <b>보낼 때 자동으로</b> 손님 정보로
              바뀝니다. 예:{" "}
              <code className="rounded bg-zinc-100 px-1">
                {"{이름}"}님 반갑습니다
              </code>{" "}
              → <span className="text-zinc-700">김민수님 반갑습니다</span>
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
              {VARS.map((v) => (
                <div key={v.name}>
                  <dt className="font-mono font-semibold text-teal-700">
                    {v.name}
                  </dt>
                  <dd className="text-zinc-500">{v.desc}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        {/* ── 오른쪽: 설정 ── */}
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">⚙️ 기본 설정</p>
              <form action={toggleAutomation}>
                <input type="hidden" name="id" value={auto.id} />
                <input
                  type="hidden"
                  name="next"
                  value={String(!auto.enabled)}
                />
                <ToggleSwitch
                  on={auto.enabled}
                  label={auto.enabled ? "켜짐" : "꺼짐"}
                />
              </form>
            </div>
            <form action={updateAutomation} className="space-y-3 text-sm">
              <input type="hidden" name="id" value={auto.id} />
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">이름</span>
                <input
                  name="name"
                  defaultValue={auto.name}
                  className="mt-1 w-full rounded-lg border px-2.5 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">
                  손님이 언제 들어오나요?
                </span>
                <select
                  name="trigger"
                  defaultValue={auto.trigger}
                  className="mt-1 w-full rounded-lg border px-2.5 py-1.5"
                >
                  {Object.entries(TRIGGER_LABEL).map(([v, t]) => (
                    <option key={v} value={v}>
                      {TRIGGER_META[v]?.icon} {t}
                    </option>
                  ))}
                </select>
                {trigMeta && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {trigMeta.hint}
                  </p>
                )}
              </label>

              <div>
                <p className="text-xs font-medium text-zinc-600">
                  🛑 이러면 남은 문자는 그만 보내기
                </p>
                <p className="mb-1.5 text-[11px] text-zinc-400">
                  이미 원하는 걸 한 손님에게 계속 재촉하지 않도록
                </p>
                <div className="space-y-1.5">
                  {STOP_META.map((s) => (
                    <label
                      key={s.key}
                      className="flex items-start gap-2 rounded-lg border p-2"
                    >
                      <input
                        type="checkbox"
                        name={`stop_${s.key}`}
                        defaultChecked={stop.has(s.key)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-xs font-medium text-zinc-700">
                          {s.label}
                        </span>
                        <span className="block text-[11px] text-zinc-400">
                          {s.consequence}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="w-full rounded-lg bg-black py-2 font-semibold text-white hover:bg-zinc-800">
                설정 저장
              </button>
            </form>
          </Card>

          <Card>
            {auto.campaignId ? (
              <form action={removeCampaignOverride}>
                <input type="hidden" name="id" value={auto.id} />
                <p className="mb-2 text-[11.5px] text-zinc-500">
                  이 캠페인만의 설정입니다. 지우면 다시 모든 캠페인 공통 기본값을
                  따릅니다.
                </p>
                <button className="text-xs text-red-600 underline">
                  캠페인 전용 설정 삭제 → 공통 기본값으로
                </button>
              </form>
            ) : auto.key ? (
              <p className="text-xs text-zinc-400">
                시스템 기본 자동 메시지예요. 완전히 없애기보다{" "}
                <b>위에서 끄기</b>를 추천해요.
              </p>
            ) : (
              <form action={deleteAutomation}>
                <input type="hidden" name="id" value={auto.id} />
                <button className="text-xs text-red-600 underline">
                  이 자동 메시지 완전히 삭제
                </button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * 문자 내용 textarea + 실시간 미리보기. 서버 컴포넌트 안이라 JS 없이
 * peer 셀렉터로는 라이브 반영이 안 되니, 저장된 값 기준 정적 미리보기를 보여준다.
 */
function StepBodyField({
  id,
  defaultValue,
}: {
  id: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-2">
      <textarea
        name="body"
        defaultValue={defaultValue}
        rows={5}
        placeholder="예: {이름}님, 신청하신 강의가 도착했어요! {링크}"
        className="w-full rounded-lg border px-2.5 py-2 text-[13px] leading-relaxed"
      />
      <p className="text-[11px] text-zinc-400">
        저장하면 아래 미리보기가 갱신돼요 · 자세한 변수는 아래 표 참고
      </p>
      <PhoneBubble text={previewText(defaultValue)} />
      <p className="text-right text-[10px] text-zinc-400" id={`len-${id}`}>
        {defaultValue.length}자
      </p>
    </div>
  );
}
