"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 로그(Sentry 자리)로도 남지만, 클라이언트에서도 한 번 더 기록
    console.error("route error", error);
  }, [error]);

  return (
    <div className="funnel-theme funnel-shell grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-5xl">⚠️</p>
        <h1 className="mt-4 text-xl font-bold text-[var(--fn-ink)]">
          잠시 문제가 생겼어요
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--fn-sub)]">
          일시적인 오류일 수 있어요. 다시 시도해 주세요.
          <br />
          계속되면 신청하신 문자로 회신해 주시면 도와드릴게요.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={reset}
            className="rounded-xl bg-[var(--fn-accent)] px-5 py-3 text-[14px] font-bold text-white"
          >
            다시 시도
          </button>
          <button
            onClick={() => {
              // 에러 복구 — 라우터가 깨졌을 수 있어 하드 내비게이션
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/";
            }}
            className="rounded-xl border border-[var(--fn-line)] px-5 py-3 text-[14px] font-semibold text-[var(--fn-ink)]"
          >
            처음으로
          </button>
        </div>
        {error.digest && (
          <p className="mt-4 text-[11px] text-[var(--fn-sub)]/60">
            오류코드 {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
