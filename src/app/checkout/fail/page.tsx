"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function FailInner() {
  const sp = useSearchParams();
  const code = sp.get("code") ?? "";
  const message = sp.get("message") ?? "";
  const isCanceled = code === "PAY_PROCESS_CANCELED";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <div className="mb-4 text-4xl">{isCanceled ? "↩️" : "⚠️"}</div>
      <h1 className="mb-2 text-xl font-bold text-white">
        {isCanceled ? "결제가 취소되었습니다" : "결제에 실패했습니다"}
      </h1>
      {!isCanceled && message && (
        <p className="mb-1 text-sm text-white/70">{message}</p>
      )}
      {code && !isCanceled && (
        <p className="mb-4 text-xs text-white/40">{code}</p>
      )}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => window.history.back()}
          className="block w-full rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: "var(--fn-accent)" }}
        >
          다시 시도하기
        </button>
        <button
          onClick={() => window.history.go(-2)}
          className="block w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white/70"
        >
          이전 페이지로
        </button>
      </div>
    </div>
  );
}

export default function CheckoutFailPage() {
  return (
    <div
      className="funnel-theme flex min-h-dvh items-center justify-center px-4"
      style={{ background: "var(--fn-bg)" }}
    >
      <Suspense fallback={null}>
        <FailInner />
      </Suspense>
    </div>
  );
}
