"use client";

import { useRef, useState } from "react";

/** 캠페인 이름 → slug. 영문/숫자만 남기고(한글은 slug 로 못 씀), 다 사라지면 날짜 기반으로 폴백 */
function slugify(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (base) return base;
  if (!s.trim()) return "";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `campaign-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * 캠페인 이름 입력에 맞춰 URL slug 를 자동 생성.
 * slug 를 사용자가 직접 건드리면 그때부터는 자동갱신을 멈춘다(수동 우선).
 */
export function SlugFields() {
  const [slug, setSlug] = useState("");
  const slugTouched = useRef(false);

  return (
    <>
      <label className="block">
        <span className="text-xs text-zinc-500">캠페인 이름</span>
        <input
          name="name"
          required
          placeholder="예: 3월 세일즈 웨비나"
          className="mt-1 w-full rounded border px-2 py-1"
          onChange={(e) => {
            if (!slugTouched.current) setSlug(slugify(e.target.value));
          }}
        />
      </label>
      <label className="block">
        <span className="text-xs text-zinc-500">URL slug</span>
        <input
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9-]*"
          placeholder="sales-webinar-mar"
          value={slug}
          onChange={(e) => {
            slugTouched.current = true;
            setSlug(slugify(e.target.value));
          }}
          className="mt-1 w-full rounded border px-2 py-1 font-mono"
        />
        <span className="mt-1 block text-[11px] text-zinc-400">
          이름을 입력하면 자동으로 채워집니다. 필요하면 직접 수정하세요. 페이지
          주소가 <code>/slug</code>, <code>/slug/vod</code> 형태가 됩니다.
        </span>
      </label>
    </>
  );
}
