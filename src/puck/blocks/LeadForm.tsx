"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";

const noop = () => () => {};

export function LeadForm({
  headline,
  submitLabel,
  note,
  nextPath,
  sticky = false,
  campaignId,
}: {
  headline: string;
  submitLabel: string;
  note: string;
  nextPath: string;
  sticky?: boolean;
  campaignId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // 기본은 노출(스크롤 내내 따라다님). 실제 폼이 화면에 보일 때만 숨겨 CTA 중복을 피함.
  const [showBar, setShowBar] = useState(true);
  // 고정 바는 body 로 포털 — .fn-in 애니메이션 transform 이 position:fixed 를 가두는 문제 회피
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!sticky) return;
    const el = formRef.current;
    if (!el) return;

    // 폼이 화면에 (일부라도) 보이면 하단 바를 숨김 (IO + 스크롤 폴백)
    const sync = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      setShowBar(!(r.top < vh - 80 && r.bottom > 80));
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => setShowBar(!entry.isIntersecting),
        { threshold: 0.15 },
      );
      io.observe(el);
    }
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      io?.disconnect();
    };
  }, [sticky]);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(
      () => formRef.current?.querySelector("input")?.focus(),
      450,
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const utm: Record<string, string> = {};
    if (typeof window !== "undefined") {
      new URLSearchParams(window.location.search).forEach((v, k) => {
        if (k.startsWith("utm_")) utm[k] = v;
      });
    }
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          utm,
        }),
      });
      if (!res.ok) throw new Error("submit failed");
      const { leadId } = await res.json();
      track("lead");
      router.push(`${nextPath}?l=${leadId}`);
    } catch {
      setError("잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="my-5 rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-5"
      >
        {headline && (
          <p className="mb-3 text-center text-[15px] font-bold text-[var(--fn-ink)]">
            {headline}
          </p>
        )}
        <div className="space-y-2.5">
          <Field name="name" type="text" placeholder="이름" />
          <Field name="email" type="email" placeholder="이메일 주소" />
          <Field name="phone" type="tel" placeholder="휴대폰 번호" />
        </div>
        {error && <p className="mt-2 text-sm text-[var(--fn-accent)]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--fn-accent)] px-6 py-4 text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_var(--fn-accent)] transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              처리 중…
            </>
          ) : (
            <>
              {submitLabel}
              <span aria-hidden>→</span>
            </>
          )}
        </button>
        {note && (
          <p className="mt-2 text-center text-[11px] text-[var(--fn-sub)]">
            {note}
          </p>
        )}
      </form>

      {sticky &&
        mounted &&
        createPortal(
          <div
            className={`funnel-theme fixed inset-x-0 bottom-0 z-[60] transition-transform duration-300 ${
              showBar ? "translate-y-0" : "pointer-events-none translate-y-full"
            }`}
          >
            <div className="bg-gradient-to-t from-[var(--fn-bg)] via-[var(--fn-bg)] to-transparent pb-[env(safe-area-inset-bottom)] pt-6">
              <div className="mx-auto max-w-[500px] px-5 pb-3">
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--fn-accent)] px-6 py-4 text-[15px] font-bold text-white shadow-[0_12px_30px_-8px_var(--fn-accent)] active:scale-[0.99]"
                >
                  {submitLabel}
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Field({
  name,
  type,
  placeholder,
}: {
  name: string;
  type: string;
  placeholder: string;
}) {
  return (
    <input
      name={name}
      type={type}
      required
      placeholder={placeholder}
      autoComplete={
        name === "name" ? "name" : name === "email" ? "email" : "tel"
      }
      className="w-full rounded-xl border border-[var(--fn-line)] bg-[var(--fn-field)] px-4 py-3.5 text-[15px] text-[var(--fn-ink)] outline-none transition placeholder:text-[var(--fn-sub)] focus:border-[var(--fn-accent)] focus:ring-4 focus:ring-[var(--fn-accent)]/20"
    />
  );
}
