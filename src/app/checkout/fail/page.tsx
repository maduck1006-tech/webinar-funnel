"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { paymentErrorInfo } from "@/lib/payment-errors";

function FailInner() {
  const sp = useSearchParams();
  const code = sp.get("code") ?? "";
  const info = paymentErrorInfo(code);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <div className="mb-4 text-4xl">{info.canceled ? "↩️" : "⚠️"}</div>
      <h1 className="mb-2 text-xl font-bold text-white">{info.title}</h1>
      <p className="text-sm leading-relaxed text-white/70">{info.detail}</p>

      <div className="mt-6 space-y-3">
        <button
          onClick={() => window.history.back()}
          className="block w-full rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: "var(--fn-accent)" }}
        >
          {info.retryable ? "다시 시도하기" : "주문서로 돌아가기"}
        </button>
        <button
          onClick={() => window.history.go(-2)}
          className="block w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white/70"
        >
          이전 페이지로
        </button>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-white/40">
        결제가 계속 안 되면 신청하신 문자에 그대로 회신해 주세요. 도와드릴게요.
      </p>
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
