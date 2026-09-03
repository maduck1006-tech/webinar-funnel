"use client";

import { useState } from "react";
import { Card } from "@/components/admin-ui";

/**
 * 캠페인 랜딩(신청) 페이지 공유 링크 — 광고·DM·오픈카톡에 그대로 붙여넣는 주소.
 */
export function ShareCampaignLink({
  url,
  isLive,
}: {
  url: string;
  isLive: boolean;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* 클립보드 차단 환경 — 사용자가 직접 선택 복사 */
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">이 캠페인 공유 링크</p>
        {!isLive && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            아직 비공개 · 발행 후 열림
          </span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
        신청 페이지 주소예요. 광고·DM·오픈카톡에 그대로 붙여넣으면 됩니다.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <code className="min-w-0 flex-1 truncate rounded-lg border bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700">
          {url}
        </code>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex-1 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white sm:flex-none"
          >
            {done ? "복사됨 ✓" : "링크 복사"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border px-4 py-2.5 text-center text-sm font-semibold text-zinc-700 sm:flex-none"
          >
            열기 ↗
          </a>
        </div>
      </div>
    </Card>
  );
}
