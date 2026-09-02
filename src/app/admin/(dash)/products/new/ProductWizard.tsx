"use client";

import { useMemo, useState } from "react";
import { ImagePicker } from "@/components/ImagePicker";
import { SubmitButton } from "../../form-ui";
import { createProductWizard } from "../actions";

const TYPES = [
  {
    v: "workbook",
    icon: "📄",
    label: "워크북 · 자료",
    desc: "PDF·시트 등 자료를 결제 후 전달",
  },
  { v: "ebook", icon: "📕", label: "전자책", desc: "PDF 링크를 결제 후 자동 전달" },
  {
    v: "vod_course",
    icon: "🎬",
    label: "VOD 강의",
    desc: "여러 영상으로 구성된 강의",
  },
  {
    v: "coaching",
    icon: "🗓️",
    label: "1:1 코칭",
    desc: "결제 후 상담 예약으로 연결",
  },
  {
    v: "membership",
    icon: "♾️",
    label: "멤버십 (구독)",
    desc: "무료 기간 뒤 매달 자동결제로 전환",
  },
];

const won = (s: string) => {
  const n = Number(String(s).replace(/[^\d]/g, ""));
  return n ? n.toLocaleString("ko-KR") + "원" : "";
};

const inputCls =
  "mt-3 w-full rounded-lg border px-3 py-2.5 text-base outline-none focus:border-blue-500";

export function ProductWizard({
  campaignId,
  campaignName,
  placement,
  returnTo,
}: {
  campaignId: string;
  campaignName: string | null;
  placement: string;
  returnTo: string;
}) {
  const [v, setV] = useState({
    type: "",
    name: "",
    description: "",
    priceMode: "paid",
    price: "",
    compareAtPrice: "",
    deliveryAssetUrl: "",
    membershipFreeMonths: "",
  });
  const set = (patch: Partial<typeof v>) => setV((p) => ({ ...p, ...patch }));

  const steps = useMemo(() => {
    const s = ["type", "name", "paid"];
    if (v.priceMode === "paid") s.push("price");
    if (v.type === "ebook") s.push("ebook");
    if (v.type === "membership") s.push("membership");
    s.push("image", "review");
    return s;
  }, [v.type, v.priceMode]);

  const [stepKey, setStepKey] = useState("type");
  const idx = Math.max(0, steps.indexOf(stepKey));
  const cur = steps[idx];
  const typeMeta = TYPES.find((t) => t.v === v.type);

  const canNext = (() => {
    switch (cur) {
      case "type":
        return !!v.type;
      case "name":
        return v.name.trim().length > 0;
      case "price":
        return Number(v.price.replace(/[^\d]/g, "")) > 0;
      default:
        return true;
    }
  })();

  const go = (d: 1 | -1) => {
    const ni = idx + d;
    if (ni >= 0 && ni < steps.length) setStepKey(steps[ni]);
  };

  return (
    <form
      action={createProductWizard}
      className="rounded-2xl border bg-white p-5 shadow-sm"
    >
      {/* 컨텍스트 전달용 hidden */}
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="placement" value={placement} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="type" value={v.type} />
      <input type="hidden" name="priceMode" value={v.priceMode} />
      <input type="hidden" name="name" value={v.name} />
      <input type="hidden" name="description" value={v.description} />
      <input type="hidden" name="price" value={v.price} />
      <input type="hidden" name="compareAtPrice" value={v.compareAtPrice} />
      <input
        type="hidden"
        name="deliveryAssetUrl"
        value={v.deliveryAssetUrl}
      />
      <input
        type="hidden"
        name="membershipFreeMonths"
        value={v.membershipFreeMonths}
      />

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

      {/* ── 스텝별 질문 ── */}
      {cur === "type" && (
        <div>
          <Q>무엇을 파나요?</Q>
          <div className="mt-3 space-y-2">
            {TYPES.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => set({ type: t.v })}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  v.type === t.v
                    ? "border-blue-500 bg-blue-50"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">
                    {t.label}
                  </span>
                  <span className="block text-[12px] text-zinc-500">
                    {t.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cur === "name" && (
        <div>
          <Q>상품 이름을 정해주세요</Q>
          <Sub>사용자 결제창과 퍼널에 그대로 노출됩니다.</Sub>
          <input
            autoFocus
            className={inputCls}
            placeholder="예: 30일 블로그 수익화 워크북"
            value={v.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <label className="mt-4 block">
            <span className="text-[12px] font-medium text-zinc-500">
              한 줄 설명 (선택)
            </span>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="이 상품이 무엇을 해결하는지"
              value={v.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
        </div>
      )}

      {cur === "paid" && (
        <div>
          <Q>유료 상품인가요?</Q>
          <div className="mt-3 space-y-2">
            {[
              {
                m: "paid",
                t: "유료",
                d: "결제창을 띄웁니다",
              },
              {
                m: "free",
                t: "무료",
                d: "결제 없이 바로 지급 (리드 수집용)",
              },
            ].map((o) => (
              <button
                key={o.m}
                type="button"
                onClick={() => set({ priceMode: o.m })}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${
                  v.priceMode === o.m
                    ? "border-blue-500 bg-blue-50"
                    : "border-zinc-200"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold">{o.t}</span>
                  <span className="block text-[12px] text-zinc-500">{o.d}</span>
                </span>
                {v.priceMode === o.m && (
                  <span className="text-blue-500">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {cur === "price" && (
        <div>
          <Q>얼마에 파나요?</Q>
          <div className="relative">
            <input
              autoFocus
              inputMode="numeric"
              className={inputCls}
              placeholder="29000"
              value={v.price}
              onChange={(e) =>
                set({ price: e.target.value.replace(/[^\d]/g, "") })
              }
            />
            {v.price && (
              <span className="mt-1 block text-sm font-semibold text-zinc-900">
                {won(v.price)}
              </span>
            )}
          </div>
          <label className="mt-5 block">
            <span className="text-[12px] font-medium text-zinc-500">
              원래 가격 (선택) — 넣으면 취소선 + 할인율이 자동 표시됩니다
            </span>
            <input
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="49000"
              value={v.compareAtPrice}
              onChange={(e) =>
                set({ compareAtPrice: e.target.value.replace(/[^\d]/g, "") })
              }
            />
          </label>
        </div>
      )}

      {cur === "ebook" && (
        <div>
          <Q>전자책 파일 링크</Q>
          <Sub>
            결제하면 이 링크가 자동으로 전달됩니다. 나중에 채워도 돼요.
          </Sub>
          <input
            className={inputCls}
            placeholder="https:// ... .pdf"
            value={v.deliveryAssetUrl}
            onChange={(e) => set({ deliveryAssetUrl: e.target.value })}
          />
        </div>
      )}

      {cur === "membership" && (
        <div>
          <Q>무료 개월 수는?</Q>
          <Sub>
            이 기간이 지난 뒤부터 매달 {won(v.price) || "구독료"}가 자동
            결제됩니다. 비우면 1개월.
          </Sub>
          <input
            inputMode="numeric"
            className={inputCls}
            placeholder="1"
            value={v.membershipFreeMonths}
            onChange={(e) =>
              set({
                membershipFreeMonths: e.target.value.replace(/[^\d]/g, ""),
              })
            }
          />
        </div>
      )}

      {cur === "image" && (
        <div>
          <Q>상품 이미지 (선택)</Q>
          <Sub>없으면 아이콘으로 표시됩니다. 건너뛰어도 괜찮아요.</Sub>
          <div className="mt-3">
            <ImagePicker name="imageUrl" label="" />
          </div>
        </div>
      )}

      {cur === "review" && (
        <div>
          <Q>이대로 만들까요?</Q>
          <dl className="mt-3 divide-y rounded-xl border text-sm">
            <Row k="종류" val={`${typeMeta?.icon ?? ""} ${typeMeta?.label ?? v.type}`} />
            <Row k="이름" val={v.name || "—"} />
            <Row
              k="가격"
              val={
                v.priceMode === "free"
                  ? "무료"
                  : `${won(v.price) || "0원"}${
                      v.compareAtPrice ? ` (정가 ${won(v.compareAtPrice)})` : ""
                    }`
              }
            />
            {v.type === "ebook" && (
              <Row k="파일" val={v.deliveryAssetUrl || "나중에 채움"} />
            )}
            {v.type === "membership" && (
              <Row
                k="무료 개월"
                val={`${v.membershipFreeMonths || "1"}개월`}
              />
            )}
          </dl>

          {campaignId && campaignName && (
            <label className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-[13px] text-blue-900">
              <input
                type="checkbox"
                name="connectCampaign"
                value="1"
                defaultChecked
              />
              <span>
                <b>{campaignName}</b> 캠페인에 바로 연결
              </span>
            </label>
          )}
          {v.type === "vod_course" && (
            <p className="mt-3 rounded-lg bg-zinc-50 p-2.5 text-[12px] text-zinc-500">
              만든 뒤 상품 목록의 <b>강의 구성</b>에서 커리큘럼·영상을 넣으세요.
            </p>
          )}
        </div>
      )}

      {/* ── 내비게이션 ── */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="rounded-lg px-3 py-2 text-sm text-zinc-500 disabled:opacity-0"
        >
          ← 이전
        </button>
        {cur === "review" ? (
          <SubmitButton
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white"
            pendingLabel="만드는 중…"
          >
            상품 만들기
          </SubmitButton>
        ) : (
          <button
            type="button"
            onClick={() => go(1)}
            disabled={!canNext}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            다음 →
          </button>
        )}
      </div>
    </form>
  );
}

function Q({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-zinc-900">{children}</h2>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{children}</p>;
}
function Row({ k, val }: { k: string; val: string }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="shrink-0 text-zinc-400">{k}</dt>
      <dd className="truncate text-right font-medium text-zinc-800">{val}</dd>
    </div>
  );
}
