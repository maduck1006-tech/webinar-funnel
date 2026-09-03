"use client";

import { useState } from "react";
import type { InlineStep } from "@/lib/campaign-setup";
import { SubmitButton, ConfirmSubmit } from "../../form-ui";
import { TRIGGER_META } from "../../automation/_ui";
import {
  addCampaignStep,
  deleteCampaignStep,
  saveCampaignStep,
  toggleCampaignAutomation,
} from "../actions";

export type EditableAutomation = {
  id: string;
  name: string;
  icon: string;
  what: string;
  trigger: string;
  enabled: boolean;
  isGlobal: boolean;
  steps: InlineStep[];
};

const AUD_OPT: { v: string; label: string }[] = [
  { v: "all", label: "전원" },
  { v: "not_watched", label: "미시청자만" },
  { v: "not_purchased", label: "미결제자만" },
  { v: "not_booked", label: "미예약자만" },
];

const inp =
  "rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs";

function StepForm({
  automationId,
  campaignId,
  step,
}: {
  automationId: string;
  campaignId: string;
  step: InlineStep;
}) {
  const d = Math.floor(step.delayMinutes / 1440);
  const h = Math.floor((step.delayMinutes % 1440) / 60);
  const m = step.delayMinutes % 60;

  return (
    <form
      action={saveCampaignStep}
      className="rounded-lg border border-zinc-200 p-2.5"
    >
      <input type="hidden" name="automationId" value={automationId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="stepOrder" value={step.stepOrder} />

      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
        <span className="font-bold text-zinc-700">{step.stepOrder}번</span>
        <span>·</span>
        <input
          name="days"
          type="number"
          min={0}
          defaultValue={d}
          className={`${inp} w-12`}
        />
        일
        <input
          name="hours"
          type="number"
          min={0}
          defaultValue={h}
          className={`${inp} w-12`}
        />
        시간
        <input
          name="mins"
          type="number"
          min={0}
          defaultValue={m}
          className={`${inp} w-12`}
        />
        분 뒤
        <span>·</span>
        <select name="audience" defaultValue={step.audience} className={inp}>
          {AUD_OPT.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        name="body"
        rows={4}
        defaultValue={step.body}
        placeholder="문자 내용… {이름} {링크} {결제링크} {마감시각} 등 사용 가능"
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-[12.5px] leading-relaxed"
      />

      <div className="mt-1.5 flex gap-1.5">
        <SubmitButton className="rounded bg-black px-3 py-1 text-[12px] font-semibold text-white">
          저장
        </SubmitButton>
        <ConfirmSubmit
          formAction={deleteCampaignStep}
          message={`${step.stepOrder}번 문자를 삭제할까요?`}
          className="rounded border border-zinc-300 px-2.5 py-1 text-[12px] text-zinc-500"
        >
          삭제
        </ConfirmSubmit>
      </div>
    </form>
  );
}

function OneAutomation({
  a,
  campaignId,
}: {
  a: EditableAutomation;
  campaignId: string;
}) {
  const [open, setOpen] = useState(false);
  const meta = TRIGGER_META[a.trigger];

  return (
    <li className="rounded-lg border border-zinc-200 p-3">
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none">{a.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-zinc-800">
            {a.name}
            {a.enabled ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                켜짐
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">
                꺼짐
              </span>
            )}
            <span className="text-[10px] font-normal text-zinc-400">
              {meta?.label ?? a.trigger}
            </span>
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500">
            {a.what}
          </p>
        </div>
        <form action={toggleCampaignAutomation} className="shrink-0">
          <input type="hidden" name="automationId" value={a.id} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <input
            type="hidden"
            name="enabled"
            value={a.enabled ? "false" : "true"}
          />
          <SubmitButton
            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${
              a.enabled
                ? "border border-zinc-300 text-zinc-600"
                : "bg-emerald-600 text-white"
            }`}
            pendingLabel="…"
          >
            {a.enabled ? "끄기" : "켜기"}
          </SubmitButton>
        </form>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-semibold text-zinc-500 underline"
        >
          {open ? "문자 접기" : `문자 ${a.steps.length}통 펼쳐서 고치기`}
        </button>
        {a.isGlobal && (
          <span className="text-zinc-400">
            모든 캠페인 공통 · 여기서 고치면 이 캠페인 전용으로 저장돼요
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {a.steps.map((s) => (
            <StepForm
              key={s.stepOrder}
              automationId={a.id}
              campaignId={campaignId}
              step={s}
            />
          ))}
          {a.steps.length === 0 && (
            <p className="text-[11.5px] text-zinc-400">
              아직 문자가 없어요. 아래에서 추가하세요.
            </p>
          )}
          <form action={addCampaignStep}>
            <input type="hidden" name="automationId" value={a.id} />
            <input type="hidden" name="campaignId" value={campaignId} />
            <SubmitButton className="rounded border border-blue-500 px-2.5 py-1 text-[12px] font-semibold text-blue-600">
              + 문자 추가
            </SubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}

/** 자동 메시지 여러 개 — 라이브 안내 화면용 */
export function InlineAutomationEditor({
  campaignId,
  automations,
}: {
  campaignId: string;
  automations: EditableAutomation[];
}) {
  if (automations.length === 0) return null;
  const on = automations.filter((a) => a.enabled);
  const off = automations.filter((a) => !a.enabled);
  return (
    <div className="space-y-4">
      {on.length > 0 && (
        <ul className="space-y-1.5">
          {on.map((a) => (
            <OneAutomation key={a.id} a={a} campaignId={campaignId} />
          ))}
        </ul>
      )}
      {off.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-zinc-500">
            꺼져 있는 것 (켜면 발송 시작)
          </p>
          <ul className="space-y-1.5">
            {off.map((a) => (
              <OneAutomation key={a.id} a={a} campaignId={campaignId} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 자동 메시지 하나 — 개요 체크리스트용 */
export { OneAutomation };
