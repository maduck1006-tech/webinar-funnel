"use client";

import { useState } from "react";
import type { SetupGroup, SetupMessage } from "@/lib/campaign-setup";
import {
  createSlotProduct,
  saveSettingField,
  setAutomationEnabled,
} from "../actions";
import { SubmitButton } from "../../form-ui";

const TYPE_LABEL: Record<string, string> = {
  workbook: "워크북/자료",
  ebook: "전자책",
  vod_course: "VOD 강의",
  coaching: "1:1 코칭",
  membership: "멤버십",
};

function ProductInline({
  campaignId,
  slotKey,
  productType,
  priceMode,
}: {
  campaignId: string;
  slotKey: string;
  productType: string;
  priceMode: "paid" | "free";
}) {
  const [open, setOpen] = useState(false);
  const inp =
    "w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded border border-blue-500 px-2.5 py-1 text-[12px] font-semibold text-blue-600"
      >
        + 만들기
      </button>
    );
  }

  return (
    <form
      action={createSlotProduct}
      className="mt-1.5 w-full space-y-1.5 rounded-lg border border-zinc-200 p-2"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="slotKey" value={slotKey} />
      <p className="text-[11px] text-zinc-400">
        {TYPE_LABEL[productType] ?? productType} ·{" "}
        {priceMode === "free" ? "무료" : "유료"}
      </p>
      <input name="name" placeholder="상품명" required className={inp} />
      {priceMode !== "free" && (
        <input name="price" placeholder="가격 (원)" className={inp} />
      )}
      {productType === "membership" && (
        <input name="freeMonths" placeholder="무료 개월 (기본 1)" className={inp} />
      )}
      <div className="flex gap-1.5">
        <SubmitButton
          className="rounded bg-black px-3 py-1 text-[12px] font-semibold text-white"
          pendingLabel="만드는 중…"
        >
          만들고 연결
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border px-2 py-1 text-[12px] text-zinc-500"
        >
          취소
        </button>
      </div>
    </form>
  );
}

const FIELD_PLACEHOLDER: Record<string, string> = {
  bookingEmbedUrl: "되는시간 임베드 URL",
  groupChatUrl: "오픈카톡 초대 링크",
  vodSrc: "YouTube · Vimeo 링크 또는 MP4 URL",
  metaPixelId: "Meta 픽셀 ID",
};

function SettingInline({
  campaignId,
  field,
  value,
  placeholder,
}: {
  campaignId: string;
  field: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <form action={saveSettingField} className="mt-1.5 flex w-full gap-1.5">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value={field} />
      <input
        name="value"
        defaultValue={value}
        placeholder={placeholder ?? FIELD_PLACEHOLDER[field] ?? ""}
        className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs"
      />
      <SubmitButton className="shrink-0 rounded bg-black px-3 py-1 text-[12px] font-semibold text-white">
        저장
      </SubmitButton>
    </form>
  );
}

/** CRM 메시지 한 줄 — 무엇을·왜 + on/off + 문구 미리보기 */
function MessageRow({
  campaignId,
  m,
}: {
  campaignId: string;
  m: SetupMessage;
}) {
  const [showBody, setShowBody] = useState(false);
  return (
    <li className="rounded-lg border border-zinc-200 p-3">
      <div className="flex items-start gap-2.5">
        <span className="text-lg leading-none">{m.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-zinc-800">
            {m.name}
            {m.enabled ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                켜짐
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">
                꺼짐
              </span>
            )}
            {m.isGlobal && (
              <span className="text-[10px] font-normal text-zinc-400">
                (모든 캠페인 공통)
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500">
            {m.what}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {m.firstBody && (
              <button
                onClick={() => setShowBody((v) => !v)}
                className="font-semibold text-zinc-500 underline"
              >
                {showBody ? "문구 접기" : "문구 미리보기"}
                {m.stepCount > 1 ? ` (${m.stepCount}개 중 첫 문자)` : ""}
              </button>
            )}
            <a
              href={m.editHref}
              className="font-semibold text-blue-600"
              target="_blank"
              rel="noreferrer"
            >
              문구 다듬기 ↗
            </a>
          </div>
          {showBody && m.firstBody && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-[11.5px] leading-relaxed text-zinc-600">
              {m.firstBody}
            </pre>
          )}
        </div>
        <form action={setAutomationEnabled} className="shrink-0">
          <input type="hidden" name="automationId" value={m.automationId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <input
            type="hidden"
            name="enabled"
            value={m.enabled ? "false" : "true"}
          />
          <SubmitButton
            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${
              m.enabled
                ? "border border-zinc-300 text-zinc-600"
                : "bg-emerald-600 text-white"
            }`}
            pendingLabel="…"
          >
            {m.enabled ? "끄기" : "켜기"}
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

export function SetupChecklist({
  campaignId,
  groups,
  requiredDone,
  requiredTotal,
  messages,
  previewUrl,
}: {
  campaignId: string;
  groups: SetupGroup[];
  requiredDone: number;
  requiredTotal: number;
  messages: SetupMessage[];
  previewUrl: string;
}) {
  const checklistDone = groups.flatMap((g) => g.items).every((i) => i.done);
  const essentialMsgsOn = messages
    .filter((m) => m.essential)
    .every((m) => m.enabled);
  const allDone = checklistDone && essentialMsgsOn;
  const reqLeft = requiredTotal - requiredDone;

  const essentialMsgs = messages.filter((m) => m.essential);
  const optionalMsgs = messages.filter((m) => !m.essential);

  return (
    <details
      open={!allDone}
      className="mb-5 rounded-xl border border-zinc-200 bg-white"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-bold">
        <span>
          퍼널 설정 체크리스트{" "}
          {allDone ? (
            <span className="text-emerald-600">· 발행 준비 완료 ✓</span>
          ) : reqLeft > 0 ? (
            <span className="text-amber-600">· 필수 {reqLeft}개 남음</span>
          ) : (
            <span className="text-blue-600">· 발행 가능 (권장 항목 남음)</span>
          )}
        </span>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-lg bg-[var(--fn-accent,#ff3d2e)] px-3 py-1.5 text-[12px] font-bold text-white"
        >
          사용자 화면 미리보기 ↗
        </a>
      </summary>
      <div className="space-y-4 border-t px-4 py-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
              {g.title}
            </p>
            <ul className="space-y-2">
              {g.items.map((it) => (
                <li key={it.id} className="text-[13px]">
                  <div className="flex items-start gap-2">
                    <span
                      className={
                        it.done
                          ? "text-emerald-500"
                          : it.required
                            ? "text-amber-500"
                            : "text-zinc-300"
                      }
                    >
                      {it.done ? "✓" : it.required ? "!" : "○"}
                    </span>
                    <span className="flex-1">
                      <span
                        className={
                          it.done ? "text-zinc-400 line-through" : "text-zinc-800"
                        }
                      >
                        {it.label}
                      </span>
                      {!it.done && it.help && (
                        <span className="block text-[11px] text-zinc-400">
                          {it.help}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {it.preview && (
                        <a
                          href={it.preview}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] font-semibold text-zinc-500"
                        >
                          미리보기 ↗
                        </a>
                      )}
                      {!it.done && !it.inline && it.href && (
                        <a
                          href={it.href}
                          className="text-[12px] font-semibold text-blue-600"
                        >
                          하러가기 →
                        </a>
                      )}
                      {!it.done && it.inline?.kind === "product" && (
                        <ProductInline
                          campaignId={campaignId}
                          slotKey={it.inline.slotKey}
                          productType={it.inline.productType}
                          priceMode={it.inline.priceMode}
                        />
                      )}
                    </span>
                  </div>
                  {!it.done && it.inline?.kind === "setting" && (
                    <SettingInline
                      campaignId={campaignId}
                      field={it.inline.field}
                      value={it.inline.value}
                      placeholder={it.inline.placeholder}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {messages.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
              3 · CRM 메시지 — 자동으로 나가는 문자
            </p>
            <p className="mb-2 text-[11.5px] leading-relaxed text-zinc-500">
              신청·시청·결제에 맞춰 문자가 자동으로 나갑니다. 아래에서 바로
              켜고 끄고, 문구도 다듬을 수 있어요. <b>후속 문자가 매출의 절반</b>을
              만듭니다.
            </p>

            {essentialMsgs.length > 0 && (
              <>
                <p className="mb-1 text-[11px] font-semibold text-zinc-600">
                  꼭 켜야 하는 것
                </p>
                <ul className="space-y-1.5">
                  {essentialMsgs.map((m) => (
                    <MessageRow key={m.automationId} campaignId={campaignId} m={m} />
                  ))}
                </ul>
              </>
            )}

            {optionalMsgs.length > 0 && (
              <>
                <p className="mb-1 mt-3 text-[11px] font-semibold text-zinc-600">
                  매출을 더 올리는 것 (선택)
                </p>
                <ul className="space-y-1.5">
                  {optionalMsgs.map((m) => (
                    <MessageRow key={m.automationId} campaignId={campaignId} m={m} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
