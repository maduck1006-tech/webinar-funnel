"use client";

import { useState } from "react";
import { ImagePicker } from "@/components/ImagePicker";
import {
  Choice,
  SummaryRow,
  Wizard,
  wInput,
  type WizardStep,
} from "../../_wizard";
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
] as const;

const won = (s: string) => {
  const n = Number(String(s).replace(/[^\d]/g, ""));
  return n ? n.toLocaleString("ko-KR") + "원" : "";
};
const digits = (s: string) => s.replace(/[^\d]/g, "");

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
  const typeMeta = TYPES.find((t) => t.v === v.type);

  const steps: WizardStep[] = [
    {
      key: "type",
      title: "무엇을 파나요?",
      ok: !!v.type,
      body: (
        <Choice
          name="type"
          value={v.type}
          onChange={(t) => set({ type: t })}
          options={TYPES.map((t) => ({ ...t }))}
        />
      ),
    },
    {
      key: "name",
      title: "상품 이름을 정해주세요",
      sub: "사용자 결제창과 퍼널에 그대로 노출됩니다.",
      ok: v.name.trim().length > 0,
      body: (
        <>
          <input
            name="name"
            className={wInput}
            placeholder="예: 30일 블로그 수익화 워크북"
            value={v.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <label className="mt-4 block">
            <span className="text-[12px] font-medium text-zinc-500">
              한 줄 설명 (선택)
            </span>
            <textarea
              name="description"
              rows={2}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="이 상품이 무엇을 해결하는지"
              value={v.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
        </>
      ),
    },
    {
      key: "paid",
      title: "유료 상품인가요?",
      body: (
        <Choice
          name="priceMode"
          value={v.priceMode}
          onChange={(m) => set({ priceMode: m })}
          options={[
            { v: "paid", label: "유료", desc: "결제창을 띄웁니다" },
            {
              v: "free",
              label: "무료",
              desc: "결제 없이 바로 지급 (리드 수집용)",
            },
          ]}
        />
      ),
    },
  ];

  if (v.priceMode === "paid") {
    steps.push({
      key: "price",
      title: "얼마에 파나요?",
      ok: Number(digits(v.price)) > 0,
      body: (
        <>
          <input
            name="price"
            inputMode="numeric"
            className={wInput}
            placeholder="29000"
            value={v.price}
            onChange={(e) => set({ price: digits(e.target.value) })}
          />
          {v.price && (
            <span className="mt-1 block text-sm font-semibold text-zinc-900">
              {won(v.price)}
            </span>
          )}
          <label className="mt-5 block">
            <span className="text-[12px] font-medium text-zinc-500">
              원래 가격 (선택) — 넣으면 취소선 + 할인율이 자동 표시됩니다
            </span>
            <input
              name="compareAtPrice"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="49000"
              value={v.compareAtPrice}
              onChange={(e) => set({ compareAtPrice: digits(e.target.value) })}
            />
          </label>
        </>
      ),
    });
  }

  if (v.type === "ebook") {
    steps.push({
      key: "ebook",
      title: "전자책 파일 링크",
      sub: "결제하면 이 링크가 자동으로 전달됩니다. 나중에 채워도 돼요.",
      body: (
        <input
          name="deliveryAssetUrl"
          className={wInput}
          placeholder="https:// ... .pdf"
          value={v.deliveryAssetUrl}
          onChange={(e) => set({ deliveryAssetUrl: e.target.value })}
        />
      ),
    });
  }

  if (v.type === "membership") {
    steps.push({
      key: "membership",
      title: "무료 개월 수는?",
      // '원가/구독료가' 처럼 조사가 틀어지지 않게 '씩'으로 통일
      sub: `이 기간이 지난 뒤부터 매달 ${
        won(v.price) || "구독료"
      }씩 자동 결제됩니다. 비우면 1개월.`,
      body: (
        <input
          name="membershipFreeMonths"
          inputMode="numeric"
          className={wInput}
          placeholder="1"
          value={v.membershipFreeMonths}
          onChange={(e) => set({ membershipFreeMonths: digits(e.target.value) })}
        />
      ),
    });
  }

  steps.push(
    {
      key: "image",
      title: "상품 이미지 (선택)",
      sub: "없으면 아이콘으로 표시됩니다. 건너뛰어도 괜찮아요.",
      body: <ImagePicker name="imageUrl" label="" />,
    },
    {
      key: "review",
      title: "이대로 만들까요?",
      body: (
        <>
          <dl className="divide-y rounded-xl border text-sm">
            <SummaryRow
              k="종류"
              val={`${typeMeta?.icon ?? ""} ${typeMeta?.label ?? v.type}`}
            />
            <SummaryRow k="이름" val={v.name || "—"} />
            <SummaryRow
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
              <SummaryRow k="파일" val={v.deliveryAssetUrl || "나중에 채움"} />
            )}
            {v.type === "membership" && (
              <SummaryRow
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
        </>
      ),
    },
  );

  return (
    <Wizard
      steps={steps}
      action={createProductWizard}
      submitLabel="상품 만들기"
      pendingLabel="만드는 중…"
      hidden={{ campaignId, placement, returnTo }}
    />
  );
}
