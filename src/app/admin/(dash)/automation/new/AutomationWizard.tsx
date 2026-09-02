"use client";

import { useActionState, useRef, useState } from "react";
import {
  Choice,
  SummaryRow,
  Wizard,
  wInput,
  type WizardStep,
} from "../../_wizard";
import {
  AUDIENCE_META,
  humanDelay,
  PhoneBubble,
  plainSentence,
  previewText,
  SAMPLE_VARS,
  STOP_META,
  TRIGGER_META,
} from "../_ui";
import { createAutomationWizard } from "../actions";

const DELAYS = [
  { v: "0", label: "바로 (즉시)" },
  { v: "30", label: "30분 뒤" },
  { v: "60", label: "1시간 뒤" },
  { v: "180", label: "3시간 뒤" },
  { v: "1440", label: "1일 뒤" },
  { v: "4320", label: "3일 뒤" },
  { v: "custom", label: "직접 입력" },
];

/** 트리거별 기본 이름/문구 제안 — 빈 화면에서 막히지 않게 */
const SUGGEST: Record<string, { name: string; body: string }> = {
  signup: {
    name: "신청 확인 안내",
    body: "{이름}님, 신청 감사합니다!\n아래 링크에서 바로 시청하실 수 있어요.\n{링크}",
  },
  watch_start: {
    name: "시청 시작 후 오퍼",
    body: "{이름}님, 강의는 어떠셨나요?\n오늘까지만 드리는 {상품명} 혜택이에요.\n{결제링크}",
  },
  purchase: {
    name: "결제 완료 안내",
    body: "{이름}님, 결제가 완료됐어요!\n아래에서 바로 확인하실 수 있습니다.\n{다운로드링크}",
  },
  booking: {
    name: "상담 예약 확정 안내",
    body: "{이름}님, 상담이 예약됐어요.\n예약 시간에 맞춰 연락드릴게요.",
  },
  manual: {
    name: "직접 넣는 안내 문자",
    body: "{이름}님, 안녕하세요.",
  },
  cart_abandon: {
    name: "결제 이탈 복구",
    body: "{이름}님, 결제가 중간에 멈췄어요.\n카드 문제였다면 아래에서 다시 시도해보세요.\n{결제링크}",
  },
  event_registered: {
    name: "라이브 종료 후 안내",
    body: "{이름}님, 오늘 라이브 참여 감사합니다!\n다시보기는 여기서 볼 수 있어요.\n{링크}",
  },
};

export function AutomationWizard({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string | null;
}) {
  const [state, formAction] = useActionState(createAutomationWizard, null);

  const [trigger, setTrigger] = useState("");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("all");
  const [delayPick, setDelayPick] = useState("1440");
  const [customDelay, setCustomDelay] = useState("");
  const [body, setBody] = useState("");
  const nameTouched = useRef(false);
  const bodyTouched = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const delayMinutes =
    delayPick === "custom"
      ? Math.max(0, Number(customDelay.replace(/[^\d]/g, "")) || 0)
      : Number(delayPick);

  function pickTrigger(t: string) {
    setTrigger(t);
    const s = SUGGEST[t];
    if (s && !nameTouched.current) setName(s.name);
    if (s && !bodyTouched.current) setBody(s.body);
  }

  function insertVar(k: string) {
    bodyTouched.current = true;
    const el = bodyRef.current;
    const token = `{${k}}`;
    if (!el) return setBody((b) => b + token);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  const steps: WizardStep[] = [
    {
      key: "trigger",
      title: "손님이 무엇을 하면 보낼까요?",
      sub: "이 순간부터 시간을 재기 시작합니다.",
      ok: !!trigger,
      body: (
        <Choice
          name="trigger"
          value={trigger}
          onChange={pickTrigger}
          options={Object.entries(TRIGGER_META).map(([v, t]) => ({
            v,
            icon: t.icon,
            label: t.label,
            desc: t.hint,
          }))}
        />
      ),
    },
    {
      key: "name",
      title: "이 자동 메시지의 이름은?",
      sub: "관리용이라 손님에게는 안 보여요. 나중에 목록에서 찾기 쉽게 지으세요.",
      ok: name.trim().length > 0,
      body: (
        <input
          name="name"
          className={wInput}
          placeholder="예: 신청 후 5일 스토리"
          value={name}
          onChange={(e) => {
            nameTouched.current = true;
            setName(e.target.value);
          }}
        />
      ),
    },
    {
      key: "delay",
      title: "얼마 뒤에 보낼까요?",
      sub: `${TRIGGER_META[trigger]?.verb ?? "행동하면"} 이 시간이 지난 뒤 나갑니다.`,
      ok: delayPick !== "custom" || customDelay.trim().length > 0,
      body: (
        <>
          <input type="hidden" name="delayMinutes" value={delayMinutes} />
          <Choice
            value={delayPick}
            onChange={setDelayPick}
            options={DELAYS.map((d) => ({ v: d.v, label: d.label }))}
          />
          {delayPick === "custom" && (
            <label className="mt-3 block">
              <span className="text-[12px] font-medium text-zinc-500">
                몇 분 뒤에 보낼까요? (1일 = 1440분)
              </span>
              <input
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="2880"
                value={customDelay}
                onChange={(e) =>
                  setCustomDelay(e.target.value.replace(/[^\d]/g, ""))
                }
              />
              {customDelay && (
                <span className="mt-1 block text-[12px] text-zinc-500">
                  = {humanDelay(delayMinutes)}
                </span>
              )}
            </label>
          )}
        </>
      ),
    },
    {
      key: "audience",
      title: "누구에게 보낼까요?",
      sub: "보낼 시점에 조건을 다시 확인해서, 해당하는 사람에게만 나갑니다.",
      body: (
        <Choice
          name="audience"
          value={audience}
          onChange={setAudience}
          options={Object.entries(AUDIENCE_META).map(([v, a]) => ({
            v,
            label: a.label,
            desc: a.example,
          }))}
        />
      ),
    },
    {
      key: "body",
      title: "무슨 문자를 보낼까요?",
      sub: "아래 버튼을 눌러 변수를 넣으면 발송할 때 손님 정보로 자동으로 채워집니다.",
      ok: body.trim().length > 0,
      body: (
        <>
          <textarea
            ref={bodyRef}
            name="body"
            rows={5}
            className="w-full rounded-lg border px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-500"
            placeholder="{이름}님, 신청 감사합니다!"
            value={body}
            onChange={(e) => {
              bodyTouched.current = true;
              setBody(e.target.value);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(SAMPLE_VARS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => insertVar(k)}
                className="rounded-full border px-2.5 py-1 text-[11px] text-zinc-600 hover:border-blue-400 hover:text-blue-600"
              >
                + {k}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <PhoneBubble text={previewText(body)} />
          </div>
        </>
      ),
    },
    {
      key: "stop",
      title: "언제 이 흐름을 멈출까요?",
      sub: "이미 산 사람에게 '어서 사세요' 문자가 가는 사고를 막아줍니다. (선택)",
      body: (
        <div className="space-y-2">
          {STOP_META.map((s) => (
            <label
              key={s.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3"
            >
              <input
                type="checkbox"
                name={`stop_${s.key}`}
                className="mt-0.5"
                defaultChecked={s.key === "purchase"}
              />
              <span>
                <span className="block text-sm font-semibold text-zinc-900">
                  손님이 {s.label} 멈춤
                </span>
                <span className="mt-0.5 block text-[12px] text-zinc-500">
                  {s.consequence}
                </span>
              </span>
            </label>
          ))}
        </div>
      ),
    },
    {
      key: "review",
      title: "이대로 만들까요?",
      body: (
        <>
          <p className="rounded-xl bg-zinc-50 p-3 text-[13px] leading-relaxed text-zinc-700">
            {trigger
              ? plainSentence(trigger, delayMinutes, audience)
              : "—"}
          </p>
          <dl className="mt-3 divide-y rounded-xl border text-sm">
            <SummaryRow k="이름" val={name || "—"} />
            <SummaryRow
              k="적용 범위"
              val={campaignName ? `${campaignName} 전용` : "모든 캠페인 공통"}
            />
            <SummaryRow k="보내는 시점" val={humanDelay(delayMinutes)} />
            <SummaryRow
              k="받는 사람"
              val={AUDIENCE_META[audience]?.short ?? audience}
            />
          </dl>
          <div className="mt-3">
            <PhoneBubble text={previewText(body)} />
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-700">
            ⚠️ 만들면 <b>꺼진 상태</b>로 시작합니다. 문구를 확인한 뒤 목록에서
            직접 켜주세요. 문자는 15분마다 확인해서 시간이 된 것만 나갑니다.
          </p>
        </>
      ),
    },
  ];

  return (
    <Wizard
      steps={steps}
      action={formAction}
      submitLabel="자동 메시지 만들기"
      pendingLabel="만드는 중…"
      error={state?.error ?? null}
      hidden={{ campaignId }}
    />
  );
}
