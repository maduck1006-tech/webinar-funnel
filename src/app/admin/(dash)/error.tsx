"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin route error", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div className="max-w-sm">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-3 text-lg font-bold">화면을 불러오지 못했어요</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          일시적인 오류일 수 있어요. 다시 시도해 주세요.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
          <button
            onClick={() => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/admin";
            }}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            대시보드로
          </button>
        </div>
        {error.digest && (
          <p className="mt-3 text-xs text-zinc-400">오류코드 {error.digest}</p>
        )}
      </div>
    </div>
  );
}
