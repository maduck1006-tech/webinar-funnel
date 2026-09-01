"use client";

import { useState } from "react";

type T = {
  key: string;
  name: string;
  tagline: string;
  icon: string;
  steps: number;
  automations: number;
  slots: number;
};

export function TemplatePicker({ templates }: { templates: T[] }) {
  const [selected, setSelected] = useState<string>(templates[0]?.key ?? "blank");

  return (
    <div>
      <input type="hidden" name="templateKey" value={selected === "blank" ? "" : selected} />
      <p className="mb-2 text-xs font-semibold text-zinc-600">퍼널 형태</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {templates.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSelected(t.key)}
            className={`rounded-xl border p-3 text-left transition ${
              selected === t.key
                ? "border-blue-500 ring-1 ring-blue-500"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{t.icon}</span>
              <span className="text-sm font-bold text-zinc-900">{t.name}</span>
              {selected === t.key && (
                <span className="ml-auto text-xs font-bold text-blue-500">
                  ✓ 선택됨
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              {t.tagline}
            </p>
            <p className="mt-1.5 text-[11px] text-zinc-400">
              단계 {t.steps}
              {t.automations > 0 && ` · 자동 메시지 ${t.automations}`}
              {t.slots > 0 && ` · 상품 슬롯 ${t.slots}`}
            </p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelected("blank")}
          className={`rounded-xl border p-3 text-left transition ${
            selected === "blank"
              ? "border-blue-500 ring-1 ring-blue-500"
              : "border-dashed border-zinc-300 hover:border-zinc-400"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">⬜</span>
            <span className="text-sm font-bold text-zinc-900">빈 캠페인</span>
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">
            에버그린 기본 구성으로 시작 (직접 조립)
          </p>
        </button>
      </div>
    </div>
  );
}
