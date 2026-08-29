"use client";

import { useEffect, useState } from "react";

/**
 * 스크롤을 따라다니는 상단 긴급성 바.
 * - rushSeconds > 0: rushSeconds 초부터 0초까지 카운트다운하며 빨간 게이지 바가 같이 줄어들고,
 *   0초가 되면 곧바로 다시 rushSeconds 초부터 반복(무한 루프). (deadlineIso 무시)
 *   실제 마감이 아니라 시각 효과.
 * - rushSeconds = 0: deadlineIso 기준 실제 D-day + HH:MM:SS 카운트다운(게이지 100% 고정).
 * 색·라운드·토큰은 퍼널 테마(--fn-*)와 일관.
 */
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
const mmss = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`;

type View = {
  dday: number | null;
  clock: string | null;
  /** 0~100, 빨간 게이지 남은 비율 */
  pct: number;
  /** 루프 리셋 순간엔 게이지가 되돌아가는 애니메이션을 끔 */
  noAnim: boolean;
  expired: boolean;
};

export function UrgencyBar({
  text,
  ctaLabel,
  ctaHref,
  deadlineIso,
  rushSeconds = 0,
}: {
  text: string;
  ctaLabel: string;
  ctaHref: string;
  deadlineIso: string;
  rushSeconds?: number;
}) {
  const rush = rushSeconds > 0;

  const [view, setView] = useState<View>(() => ({
    dday: null,
    clock: rush ? mmss(rushSeconds) : null,
    pct: 100,
    noAnim: false,
    expired: false,
  }));

  useEffect(() => {
    const start = Date.now();
    let prevPct = 100;

    const tick = () => {
      if (rush) {
        const cycle = (Date.now() - start) / 1000 / rushSeconds;
        const p = cycle - Math.floor(cycle); // 0→1 톱니파(무한 반복)
        const remain = rushSeconds * (1 - p);
        const pct = (1 - p) * 100;
        const noAnim = pct > prevPct + 1; // 루프 리셋 프레임
        prevPct = pct;
        setView({
          dday: null,
          clock: mmss(Math.ceil(remain)),
          pct,
          noAnim,
          expired: false,
        });
        return;
      }
      if (!deadlineIso) return;
      const left = new Date(deadlineIso).getTime() - Date.now();
      if (Number.isNaN(left)) {
        setView({ dday: null, clock: null, pct: 100, noAnim: false, expired: false });
      } else if (left <= 0) {
        setView({ dday: null, clock: null, pct: 0, noAnim: false, expired: true });
      } else {
        const s = Math.floor(left / 1000);
        setView({
          dday: Math.floor(s / 86400),
          clock: `${pad((s % 86400) / 3600)}:${pad((s % 3600) / 60)}:${pad(
            s % 60,
          )}`,
          pct: 100,
          noAnim: false,
          expired: false,
        });
      }
    };

    const id = setInterval(tick, rush ? 50 : 1000);
    return () => clearInterval(id);
  }, [rush, rushSeconds, deadlineIso]);

  const { dday, clock, pct, noAnim, expired } = view;

  return (
    <div className="fn-urgency relative mx-auto flex max-w-[500px] items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[var(--fn-bg-2)] px-4 py-3 text-[13px] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]">
      {/* 남은시간 게이지 */}
      <div
        className="absolute inset-y-0 left-0 bg-[var(--fn-accent)]"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          transition: noAnim ? "none" : "width 75ms linear",
        }}
        aria-hidden
      />

      <span className="relative font-bold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
        {expired ? "신청이 마감되었습니다" : text}
      </span>

      {!expired && (
        <span className="relative flex shrink-0 items-center gap-2.5">
          {clock && (
            <span className="flex items-baseline gap-2">
              {dday !== null && (
                <>
                  <span className="text-[13px] font-extrabold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                    D-{dday}
                  </span>
                  <span className="text-white/40">|</span>
                </>
              )}
              <span className="text-[15px] font-extrabold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                {clock}
              </span>
            </span>
          )}
          {ctaLabel && (
            <a
              href={ctaHref || "#apply"}
              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--fn-accent)]"
            >
              {ctaLabel}
            </a>
          )}
        </span>
      )}
    </div>
  );
}
