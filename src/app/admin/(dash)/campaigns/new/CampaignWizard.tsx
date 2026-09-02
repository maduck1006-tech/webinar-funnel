"use client";

import { useActionState, useRef, useState } from "react";
import {
  Choice,
  SummaryRow,
  Wizard,
  wInput,
  type WizardStep,
} from "../../_wizard";
import { createCampaignWizard } from "../actions";

export type TemplateOpt = {
  key: string;
  name: string;
  tagline: string;
  icon: string;
  stepTitles: string[];
  automations: number;
  slots: number;
};

export type SourceOpt = { id: string; name: string; isTemplate: boolean };

/** 이름 → slug. 한글은 slug 로 못 쓰므로 다 사라지면 날짜 기반 폴백 */
function slugify(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (base) return base.slice(0, 50);
  if (!s.trim()) return "";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `campaign-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function CampaignWizard({
  templates,
  sources,
  takenSlugs,
  reservedSlugs,
  siteOrigin,
}: {
  templates: TemplateOpt[];
  sources: SourceOpt[];
  takenSlugs: string[];
  reservedSlugs: string[];
  siteOrigin: string;
}) {
  const [state, formAction] = useActionState(createCampaignWizard, null);

  const canClone = sources.length > 0;
  const [mode, setMode] = useState<string>("template");
  const [templateKey, setTemplateKey] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const slugTouched = useRef(false);

  const cloning = canClone && mode === "clone";
  const tpl = templates.find((t) => t.key === templateKey);
  const src = sources.find((s) => s.id === sourceId);

  const slugTaken = takenSlugs.includes(slug);
  const slugReserved = reservedSlugs.includes(slug);
  const slugShapeOk = SLUG_RE.test(slug);
  const slugOk = slugShapeOk && !slugTaken && !slugReserved;

  const steps: WizardStep[] = [];

  if (canClone) {
    steps.push({
      key: "mode",
      title: "어떻게 시작할까요?",
      body: (
        <Choice
          value={mode}
          onChange={setMode}
          options={[
            {
              v: "template",
              icon: "✨",
              label: "템플릿으로 새로 만들기",
              desc: "퍼널 형태를 고르면 단계·페이지·자동 메시지가 한 번에 깔립니다",
            },
            {
              v: "clone",
              icon: "📋",
              label: "기존 캠페인 복제",
              desc: "설정·페이지 카피·상품 연결까지 그대로 복사해서 시작",
            },
          ]}
        />
      ),
    });
  }

  if (cloning) {
    steps.push({
      key: "source",
      title: "어떤 캠페인을 복제할까요?",
      sub: "페이지 카피·상품 연결·카운트다운 설정이 그대로 복사됩니다.",
      ok: !!sourceId,
      body: (
        <Choice
          value={sourceId}
          onChange={setSourceId}
          options={sources.map((s) => ({
            v: s.id,
            icon: s.isTemplate ? "🧩" : "📄",
            label: s.name,
            desc: s.isTemplate ? "템플릿 캠페인" : undefined,
          }))}
        />
      ),
    });
  } else {
    steps.push({
      key: "template",
      title: "어떤 퍼널인가요?",
      sub: "나중에 단계를 더하거나 뺄 수 있어요.",
      ok: !!templateKey,
      body: (
        <Choice
          value={templateKey}
          onChange={setTemplateKey}
          options={[
            ...templates.map((t) => ({
              v: t.key,
              icon: t.icon,
              label: t.name,
              desc: t.tagline,
              meta: (
                <>
                  {t.stepTitles.join(" → ")}
                  {t.automations > 0 && ` · 자동 메시지 ${t.automations}`}
                  {t.slots > 0 && ` · 상품 슬롯 ${t.slots}`}
                </>
              ),
            })),
            {
              v: "blank",
              icon: "⬜",
              label: "빈 캠페인",
              desc: "에버그린 기본 구성으로 시작 (직접 조립)",
            },
          ]}
        />
      ),
    });
  }

  steps.push(
    {
      key: "name",
      title: "캠페인 이름은?",
      sub: "관리자만 보는 이름이에요. 손님에게는 안 보입니다.",
      ok: name.trim().length > 0,
      body: (
        <input
          name="name"
          className={wInput}
          placeholder="예: 3월 세일즈 웨비나"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched.current) setSlug(slugify(e.target.value));
          }}
        />
      ),
    },
    {
      key: "slug",
      title: "페이지 주소를 정해주세요",
      sub: "이름에서 자동으로 만들었어요. 마음에 안 들면 고치세요.",
      ok: slugOk,
      body: (
        <>
          <div className="flex items-center gap-1 rounded-lg border px-3 py-2.5 focus-within:border-blue-500">
            <span className="shrink-0 text-sm text-zinc-400">
              {siteOrigin}/
            </span>
            <input
              name="slug"
              className="min-w-0 flex-1 border-0 bg-transparent font-mono text-base outline-none"
              placeholder="sales-webinar-mar"
              value={slug}
              onChange={(e) => {
                slugTouched.current = true;
                setSlug(slugify(e.target.value));
              }}
            />
          </div>
          {slug && !slugShapeOk && (
            <p className="mt-2 text-[12px] text-red-600">
              영문 소문자·숫자·하이픈(-)만, 2~50자로 써주세요.
            </p>
          )}
          {slugTaken && (
            <p className="mt-2 text-[12px] text-red-600">
              이미 쓰고 있는 주소예요. 다른 걸로 바꿔주세요.
            </p>
          )}
          {slugReserved && (
            <p className="mt-2 text-[12px] text-red-600">
              시스템이 쓰는 주소라 쓸 수 없어요.
            </p>
          )}
          {slugOk && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500">
              페이지 주소가 이렇게 됩니다
              <span className="mt-1 block font-mono text-zinc-700">
                {siteOrigin}/{slug}
                <br />
                {siteOrigin}/{slug}/vod
              </span>
            </div>
          )}
        </>
      ),
    },
    {
      key: "review",
      title: "이대로 만들까요?",
      body: (
        <>
          <dl className="divide-y rounded-xl border text-sm">
            <SummaryRow
              k="시작"
              val={
                cloning
                  ? `복제 · ${src?.name ?? "—"}`
                  : templateKey === "blank"
                    ? "⬜ 빈 캠페인"
                    : `${tpl?.icon ?? ""} ${tpl?.name ?? "—"}`
              }
            />
            <SummaryRow k="이름" val={name || "—"} />
            <SummaryRow
              k="주소"
              val={<span className="font-mono">/{slug}</span>}
            />
            {!cloning && tpl && (
              <SummaryRow k="단계" val={tpl.stepTitles.join(" → ")} />
            )}
          </dl>
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[12px] leading-relaxed text-blue-900">
            만들면 <b>초안(draft)</b> 상태로 시작합니다. 이어서 뜨는{" "}
            <b>퍼널 설정 체크리스트</b>를 따라가면 발행까지 갈 수 있어요.
          </p>
        </>
      ),
    },
  );

  return (
    <Wizard
      steps={steps}
      action={formAction}
      submitLabel="캠페인 만들기"
      pendingLabel="만드는 중…"
      error={state?.error ?? null}
      hidden={{
        templateKey: cloning || templateKey === "blank" ? "" : templateKey,
        sourceId: cloning ? sourceId : "",
      }}
    />
  );
}
