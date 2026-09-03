"use client";

import { useMemo, useState } from "react";

export type TemplateOpt = {
  id: string;
  name: string;
  content: string;
  header: string | null;
  variables: string[];
};

/** 자동 메시지의 우리 치환키 — 템플릿 변수에 연결할 때 고른다 */
const OUR_KEYS = [
  "{이름}",
  "{링크}",
  "{예약링크}",
  "{결제링크}",
  "{단톡방링크}",
  "{다운로드링크}",
  "{상품명}",
  "{마감시각}",
];

export function StepChannelField({
  templates,
  defaultChannel,
  defaultTemplateId,
  defaultMap,
}: {
  templates: TemplateOpt[];
  defaultChannel: string;
  defaultTemplateId: string | null;
  defaultMap: Record<string, string> | null;
}) {
  const [channel, setChannel] = useState(
    defaultChannel === "alimtalk" ? "alimtalk" : "sms",
  );
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const [map, setMap] = useState<Record<string, string>>(defaultMap ?? {});

  const tpl = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const preview = tpl
    ? (tpl.header ? `[${tpl.header}]\n` : "") +
      tpl.content.replace(/#\{([^}]+)\}/g, (_, k: string) =>
        map[k] ? `«${map[k]}»` : `#{${k}}`,
      )
    : "";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
      <input type="hidden" name="channel" value={channel} />
      <input
        type="hidden"
        name="kakaoTemplateId"
        value={channel === "alimtalk" ? templateId : ""}
      />
      <input
        type="hidden"
        name="kakaoVariableMap"
        value={
          channel === "alimtalk" ? JSON.stringify(map) : ""
        }
      />

      <span className="text-xs font-medium text-zinc-600">📨 발송 채널</span>
      <div className="mt-1.5 flex gap-1.5">
        {[
          { v: "sms", label: "문자" },
          { v: "alimtalk", label: "카카오 알림톡" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setChannel(o.v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              channel === o.v
                ? "pick-on text-zinc-900"
                : "border-zinc-200 text-zinc-500"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {channel === "alimtalk" && (
        <>
          {templates.length === 0 ? (
            <p className="mt-2 rounded border border-dashed p-2 text-[11.5px] text-zinc-400">
              승인된 템플릿이 없습니다. 연동 설정 → 카카오 알림톡에서 먼저
              불러오세요.
            </p>
          ) : (
            <>
              <select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setMap({});
                }}
                className="mt-2 w-full rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <option value="">— 템플릿 선택 —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {tpl && tpl.variables.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] font-medium text-zinc-500">
                    템플릿 변수 연결
                  </p>
                  {tpl.variables.map((v) => (
                    <label
                      key={v}
                      className="flex items-center gap-2 text-[11.5px]"
                    >
                      <code className="w-28 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5">
                        {"#{"}
                        {v}
                        {"}"}
                      </code>
                      <span className="text-zinc-400">←</span>
                      <select
                        value={map[v] ?? ""}
                        onChange={(e) =>
                          setMap((m) => ({ ...m, [v]: e.target.value }))
                        }
                        className="flex-1 rounded border px-1.5 py-1"
                      >
                        <option value="">— 없음 —</option>
                        {OUR_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              {tpl && (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11.5px] leading-relaxed text-zinc-600">
                  {preview}
                </pre>
              )}
            </>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
            알림톡 발송이 실패하면(카톡 미사용·채널 차단) 오른쪽 문자 내용으로
            자동 대체됩니다. 그래서 문자 문구도 채워두세요.
          </p>
        </>
      )}
    </div>
  );
}
