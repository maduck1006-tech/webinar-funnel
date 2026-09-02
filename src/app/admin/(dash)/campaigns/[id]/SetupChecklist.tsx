"use client";

import { useState } from "react";
import type { SetupGroup } from "@/lib/campaign-setup";
import { createSlotProduct, saveSettingField } from "../actions";

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
        {TYPE_LABEL[productType] ?? productType} · {priceMode === "free" ? "무료" : "유료"}
      </p>
      <input name="name" placeholder="상품명" required className={inp} />
      {priceMode !== "free" && (
        <input name="price" placeholder="가격 (원)" className={inp} />
      )}
      {productType === "membership" && (
        <input name="freeMonths" placeholder="무료 개월 (기본 1)" className={inp} />
      )}
      <div className="flex gap-1.5">
        <button className="rounded bg-black px-3 py-1 text-[12px] font-semibold text-white">
          만들고 연결
        </button>
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
    <form
      action={saveSettingField}
      className="mt-1.5 flex w-full gap-1.5"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="field" value={field} />
      <input
        name="value"
        defaultValue={value}
        placeholder={placeholder ?? FIELD_PLACEHOLDER[field] ?? ""}
        className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs"
      />
      <button className="shrink-0 rounded bg-black px-3 py-1 text-[12px] font-semibold text-white">
        저장
      </button>
    </form>
  );
}

export function SetupChecklist({
  campaignId,
  groups,
  requiredDone,
  requiredTotal,
}: {
  campaignId: string;
  groups: SetupGroup[];
  requiredDone: number;
  requiredTotal: number;
}) {
  const allDone = groups.flatMap((g) => g.items).every((i) => i.done);
  const reqLeft = requiredTotal - requiredDone;

  return (
    <details
      open={!allDone}
      className="mb-5 rounded-xl border border-zinc-200 bg-white"
    >
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold">
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
                    {!it.done && !it.inline && it.href && (
                      <a
                        href={it.href}
                        className="shrink-0 text-[12px] font-semibold text-blue-600"
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
      </div>
    </details>
  );
}
