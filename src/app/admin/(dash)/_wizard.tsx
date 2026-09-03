"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/* ------------------------------------------------------------------ *
 * 공용 위저드 — "한 화면에 질문 하나"
 *
 * 모든 스텝의 body 는 항상 DOM 에 남아있고(감춰질 뿐) 그래서 폼 값이
 * 스텝을 오가도 유지됩니다. required 는 쓰지 마세요(숨은 필드가 제출을
 * 막습니다) — 대신 각 스텝의 ok 로 '다음'을 잠그세요.
 * ------------------------------------------------------------------ */

export type WizardStep = {
  key: string;
  title: string;
  sub?: ReactNode;
  /** false 면 '다음' 비활성 */
  ok?: boolean;
  body: ReactNode;
};

export function Wizard({
  steps,
  action,
  submitLabel = "완료",
  pendingLabel = "저장 중…",
  doneHref,
  doneLabel = "닫기",
  error,
  hidden,
}: {
  steps: WizardStep[];
  /** 있으면 마지막 스텝에서 이 서버 액션으로 제출 */
  action?: (fd: FormData) => void | Promise<void>;
  submitLabel?: string;
  pendingLabel?: string;
  /** action 이 없을 때 마지막 버튼이 이동할 주소 */
  doneHref?: string;
  doneLabel?: string;
  error?: string | null;
  /** 폼에 함께 실릴 고정 값 */
  hidden?: Record<string, string>;
}) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, steps.length - 1);
  const cur = steps[idx];
  const last = idx === steps.length - 1;
  const canNext = cur?.ok !== false;

  const inner = (
    <>
      {hidden &&
        Object.entries(hidden).map(([k, val]) => (
          <input key={k} type="hidden" name={k} value={val} />
        ))}

      {/* 진행바 */}
      <div className="mb-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${((idx + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          {idx + 1} / {steps.length}
        </p>
      </div>

      {/* 모든 스텝을 마운트해 두고 현재 것만 보여줌 (폼 값 유지) */}
      {steps.map((s, n) => (
        <div key={s.key} className={n === idx ? "" : "hidden"}>
          <h2 className="text-lg font-bold text-zinc-900">{s.title}</h2>
          {s.sub && (
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
              {s.sub}
            </p>
          )}
          <div className="mt-3">{s.body}</div>
        </div>
      ))}

      {/* bg-red-100 / text-red-700 은 admin 다크테마가 짝으로 재매핑한다.
          bg-red-50 은 재매핑 대상이 아니라 '밝은 배경 + 밝은 글씨'가 된다. */}
      {error && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setI(idx - 1)}
          disabled={idx === 0}
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 disabled:invisible"
        >
          ← 이전
        </button>
        {last ? (
          action ? (
            <WizardSubmit label={submitLabel} pendingLabel={pendingLabel} />
          ) : (
            <Link
              href={doneHref ?? "#"}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              {doneLabel}
            </Link>
          )
        ) : (
          <button
            type="button"
            onClick={() => setI(idx + 1)}
            disabled={!canNext}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            다음 →
          </button>
        )}
      </div>
    </>
  );

  const cls = "rounded-2xl border bg-white p-5 shadow-sm";
  // 1단계를 넘겼으면 '나가면 잃을 게 있다'고 Shell 에 알린다
  const dirty = idx > 0 ? "1" : undefined;
  return action ? (
    <form action={action} className={cls} data-wizard-dirty={dirty}>
      {inner}
    </form>
  ) : (
    <div className={cls} data-wizard-dirty={dirty}>
      {inner}
    </div>
  );
}

function WizardSubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/* ---------------- 공용 입력 조각 ---------------- */

export type ChoiceOption<T extends string> = {
  v: T;
  icon?: string;
  label: string;
  desc?: ReactNode;
  meta?: ReactNode;
};

/** 큰 카드형 단일 선택. name 을 주면 hidden input 으로 폼에도 실림 */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: string;
  onChange: (v: T) => void;
  options: ChoiceOption<T>[];
  name?: string;
}) {
  return (
    <div className="space-y-2">
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            /* 선택 상태는 .pick-on 으로. admin 다크테마가 text-zinc-900 은
               밝게 바꾸고 bg-blue-50 은 그대로 둬서 유틸리티로 칠하면
               '흰 배경 + 흰 글씨'가 되고, .border 는 !important 라
               인라인 style 로도 못 이긴다. */
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
              on ? "pick-on" : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            {o.icon && <span className="text-2xl leading-none">{o.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  {o.label}
                </span>
                {on && (
                  <span
                    className="ml-auto shrink-0 text-xs font-bold"
                    style={{ color: "var(--fn-accent, #2563eb)" }}
                  >
                    ✓
                  </span>
                )}
              </span>
              {o.desc && (
                <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-500">
                  {o.desc}
                </span>
              )}
              {o.meta && (
                <span className="mt-1 block text-[11px] text-zinc-400">
                  {o.meta}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const wInput =
  "w-full rounded-lg border px-3 py-2.5 text-base outline-none focus:border-blue-500";

/** 확인 스텝용 요약 줄 */
export function SummaryRow({ k, val }: { k: string; val: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-zinc-400">{k}</dt>
      <dd className="min-w-0 text-right font-medium text-zinc-800">{val}</dd>
    </div>
  );
}

/** 위저드 화면 껍데기 (제목 + 나가기) */
export function WizardShell({
  title,
  exitHref,
  exitLabel = "나가기",
  children,
}: {
  title: string;
  exitHref: string;
  exitLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[560px] py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">{title}</h1>
        <Link
          href={exitHref}
          className="text-xs text-zinc-500 underline"
          onClick={(e) => {
            const inProgress = document.querySelector('[data-wizard-dirty="1"]');
            if (
              inProgress &&
              !window.confirm("지금 나가면 입력한 내용이 사라집니다. 나갈까요?")
            ) {
              e.preventDefault();
            }
          }}
        >
          {exitLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}
