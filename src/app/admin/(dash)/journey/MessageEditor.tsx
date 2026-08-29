"use client";

import { useState } from "react";
import { Tag } from "@/components/admin-ui";
import type { JourneyStop } from "./meta";
import {
  resetCampaignMessageJ,
  saveCampaignMessageJ,
  saveGlobalMessage,
  toggleCampaignMessageJ,
  toggleGlobalMessage,
} from "./actions";

type Props = {
  stop: JourneyStop;
  campaignId: string | null;
  /** 실제 적용되는 값 */
  enabled: boolean;
  template: string;
  offsetHours: number | null;
  /** 문구 출처 */
  source: "campaign" | "global" | "default";
  /** 전역 row 가 아직 없음 (인프라 미배선) */
  missing: boolean;
  sent: number;
};

function Bubble({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-[1.72]">
      {parts.map((p, i) =>
        /^\{[^}]+\}$/.test(p) ? (
          <span
            key={i}
            className="rounded bg-teal-500/15 px-1 py-0.5 text-[12.5px] font-semibold text-teal-700"
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export function MessageEditor({
  stop,
  campaignId,
  enabled,
  template,
  offsetHours,
  source,
  missing,
  sent,
}: Props) {
  const [open, setOpen] = useState(false);
  const shown = template || stop.defaultTemplate;

  const accent =
    stop.kind === "urgent"
      ? "border-l-amber-500"
      : stop.kind === "success"
        ? "border-l-green-600"
        : stop.kind === "admin"
          ? "border-l-zinc-400"
          : "border-l-[var(--fn-accent,#ff3d2e)]";

  return (
    <div
      className={`overflow-hidden rounded-xl border border-l-[3px] bg-white ${accent} ${
        missing ? "opacity-70" : ""
      }`}
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-zinc-50 px-3.5 py-2.5">
        <span className="text-[13.5px] font-bold">{stop.title}</span>
        <span className="text-[12px] text-zinc-400">· 김영진(자동)</span>

        {missing ? (
          <Tag tone="amber">인프라 작업 중</Tag>
        ) : (
          <form
            action={campaignId ? toggleCampaignMessageJ : toggleGlobalMessage}
          >
            <input type="hidden" name="key" value={stop.triggerKey} />
            {campaignId && (
              <input type="hidden" name="campaignId" value={campaignId} />
            )}
            <input type="hidden" name="template" value={shown} />
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <button aria-label="켜기/끄기">
              <Tag tone={enabled ? "green" : "gray"}>
                {enabled ? "켜짐" : "꺼짐"}
              </Tag>
            </button>
          </form>
        )}

        {!missing && source === "campaign" && <Tag tone="blue">이 캠페인 전용</Tag>}
        {!missing && source === "global" && <Tag tone="gray">전역 문구</Tag>}
        {!missing && source === "default" && <Tag tone="gray">기본 문구</Tag>}

        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-zinc-400">
          {sent > 0 && <span>보냄 {sent}</span>}
          <span>{stop.triggerKey}</span>
        </span>
      </div>

      {/* body */}
      <div className="px-4 py-3.5">
        <Bubble text={shown} />
      </div>

      {/* foot */}
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed px-3.5 py-2.5">
        {!missing ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-black px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            {open ? "닫기" : "문구 고치기"}
          </button>
        ) : (
          <span className="text-[12px] text-amber-600">
            발화 배선 후 편집 가능해집니다 (문구는 미리 저장해둘 수 있음)
          </span>
        )}
        <span className="text-[12px] text-zinc-400">왜 나가나요? — {stop.why}</span>
      </div>

      {/* editor */}
      {open && !missing && (
        <form
          action={campaignId ? saveCampaignMessageJ : saveGlobalMessage}
          className="space-y-2 border-t bg-zinc-50 px-4 py-3.5"
        >
          <input type="hidden" name="key" value={stop.triggerKey} />
          {campaignId && (
            <input type="hidden" name="campaignId" value={campaignId} />
          )}
          <textarea
            name="template"
            defaultValue={template}
            placeholder={`비우면 ${
              campaignId ? "전역" : "기본"
            } 문구 사용:\n${stop.defaultTemplate}`}
            className="h-40 w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
          />
          <p className="text-[11.5px] text-zinc-500">
            { } 안은 자동으로 채워집니다 · {"{이름} {링크} {예약링크} {결제링크} {상품명} {다운로드링크} {마감시각}"}
          </p>
          {stop.offsetHours != null && (
            <label className="flex items-center gap-2 text-[12px] text-zinc-500">
              발송 시점 (신청/시청 후 시간)
              <input
                name="offsetHours"
                defaultValue={offsetHours ?? ""}
                inputMode="decimal"
                className="w-20 rounded border px-2 py-1"
              />
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button className="rounded-lg bg-black px-3.5 py-1.5 text-[12px] font-semibold text-white">
              저장
            </button>
            {campaignId && source === "campaign" && (
              <button
                formAction={resetCampaignMessageJ}
                className="rounded-lg border px-3.5 py-1.5 text-[12px] text-zinc-500"
              >
                전역 문구로 되돌리기
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
