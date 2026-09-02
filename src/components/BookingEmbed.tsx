"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 되는시간(WhatTime) 예약 캘린더 임베드.
 * - 로드 전까지 스켈레톤/스피너
 * - 12초 내 로드 안 되면 "새 창에서 열기" 대체 링크 노출
 */
export function BookingEmbed({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setSlow(true), 12000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-xl border border-[var(--fn-line)] bg-white">
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--fn-bg-2)]">
            <div className="flex flex-col items-center gap-3 text-[var(--fn-sub)]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--fn-line)] border-t-[var(--fn-accent)]" />
              <span className="text-[13px]">예약 캘린더를 불러오는 중…</span>
            </div>
          </div>
        )}
        <iframe
          src={src}
          onLoad={() => {
            setLoaded(true);
            if (timer.current) clearTimeout(timer.current);
          }}
          className="h-[680px] w-full"
          title="상담 예약"
          loading="eager"
        />
      </div>

      {slow && !loaded && (
        <p className="mt-2 text-center text-[12.5px] text-[var(--fn-sub)]">
          예약 화면이 안 열리나요?{" "}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--fn-accent)] underline"
          >
            새 창에서 열기
          </a>
        </p>
      )}
    </div>
  );
}
