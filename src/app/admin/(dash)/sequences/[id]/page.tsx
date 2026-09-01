import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messageSequences, sequenceSteps } from "@/db/schema";
import { Card, PageHeader, Tag } from "@/components/admin-ui";
import { listCampaigns } from "@/lib/campaign";
import {
  addStep,
  deleteSequence,
  deleteStep,
  toggleSequence,
  updateSequence,
  updateStep,
} from "../actions";

export const dynamic = "force-dynamic";

const EVENT_OPTS = [
  ["signup", "무료 신청했을 때"],
  ["purchase", "결제했을 때"],
  ["booking", "상담 예약했을 때"],
  ["manual", "직접 등록"],
] as const;

const AUDIENCE_OPTS = [
  ["all", "전원"],
  ["not_purchased", "아직 결제 안 한 사람만"],
  ["not_booked", "아직 상담 예약 안 한 사람만"],
  ["not_watched", "아직 강의 안 본 사람만"],
] as const;

const VARS = "{이름} {링크} {예약링크} {결제링크} {상품명} {마감시각} {다운로드링크}";

function humanDelay(h: number) {
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d && r) return `${d}일 ${r}시간 뒤`;
  if (d) return `${d}일 뒤`;
  if (r) return `${r}시간 뒤`;
  return "등록 즉시";
}

export default async function SequenceEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [seq] = await db
    .select()
    .from(messageSequences)
    .where(eq(messageSequences.id, id));
  if (!seq) notFound();

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, id))
    .orderBy(asc(sequenceSteps.stepOrder));

  const campaigns = await listCampaigns();

  return (
    <>
      <PageHeader
        title={seq.name}
        desc={
          <Link href="/admin/sequences" className="text-blue-600 underline">
            ← 시퀀스 목록
          </Link>
        }
      />

      <div className="space-y-6">
        {/* 기본 설정 */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">기본 설정</p>
            <form action={toggleSequence}>
              <input type="hidden" name="id" value={seq.id} />
              <input
                type="hidden"
                name="next"
                value={String(!seq.enabled)}
              />
              <button className="flex items-center gap-1.5 text-xs">
                <Tag tone={seq.enabled ? "green" : "gray"}>
                  {seq.enabled ? "켜짐" : "꺼짐"}
                </Tag>
                <span className="text-zinc-500 underline">
                  {seq.enabled ? "끄기" : "켜기"}
                </span>
              </button>
            </form>
          </div>
          <form
            action={updateSequence}
            className="grid gap-3 text-sm sm:grid-cols-3"
          >
            <input type="hidden" name="id" value={seq.id} />
            <label className="block">
              <span className="text-xs text-zinc-500">이름</span>
              <input
                name="name"
                defaultValue={seq.name}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">시작 시점</span>
              <select
                name="enrollEvent"
                defaultValue={seq.enrollEvent}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                {EVENT_OPTS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">캠페인</span>
              <select
                name="campaignId"
                defaultValue={seq.campaignId ?? ""}
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
            <button className="rounded-lg bg-black px-4 py-2 font-semibold text-white sm:col-span-3 sm:w-auto">
              설정 저장
            </button>
          </form>
        </Card>

        {/* 문자 스텝들 */}
        <div className="space-y-3">
          {steps.length === 0 && (
            <Card>
              <p className="text-sm text-zinc-500">
                아직 문자가 없습니다. 아래 &quot;문자 추가&quot;를 눌러 첫 문자를
                만드세요.
              </p>
            </Card>
          )}

          {steps.map((step, i) => (
            <Card key={step.id}>
              <form action={updateStep} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="sequenceId" value={seq.id} />

                <div className="flex items-center justify-between">
                  <p className="font-bold">
                    문자 {i + 1}{" "}
                    <span className="ml-1 text-xs font-normal text-zinc-400">
                      · {humanDelay(step.delayHours)}
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

                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="text-[11px] text-zinc-400">
                      며칠 뒤
                    </span>
                    <input
                      name="days"
                      type="number"
                      min={0}
                      defaultValue={Math.floor(step.delayHours / 24)}
                      className="mt-1 w-16 rounded border px-2 py-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-zinc-400">
                      + 몇 시간 뒤
                    </span>
                    <input
                      name="hours"
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={step.delayHours % 24}
                      className="mt-1 w-16 rounded border px-2 py-1"
                    />
                  </label>
                  <label className="block flex-1">
                    <span className="text-[11px] text-zinc-400">
                      누구에게 보낼까요?
                    </span>
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
                    name="template"
                    defaultValue={step.template}
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
            <input type="hidden" name="sequenceId" value={seq.id} />
            <button className="w-full rounded-lg border-2 border-dashed py-3 text-sm font-semibold text-zinc-500 hover:bg-zinc-50">
              + 문자 추가
            </button>
          </form>
        </div>

        {/* 삭제 */}
        <Card>
          <form action={deleteSequence}>
            <input type="hidden" name="id" value={seq.id} />
            <button className="text-xs text-red-600 underline">
              이 시퀀스 전체 삭제
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
