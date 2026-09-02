"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { track } from "@/lib/track";
import {
  emailError,
  formatPhoneKR,
  nameError,
  phoneDigits,
  phoneError,
  validateLead,
  hasErrors,
} from "@/lib/form-validate";

const noop = () => () => {};

type FieldName = "name" | "email" | "phone";

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
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [errs, setErrs] = useState<Record<FieldName, string | null>>({
    name: null,
    email: null,
    phone: null,
  });
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    email: false,
    phone: false,
  });

  // 스크롤 전에는 하단 CTA 바를 숨겨 첫 화면이 잘리지 않게 함
  const [showBar, setShowBar] = useState(false);
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  const checkField = (name: FieldName, raw: string) => {
    const v =
      name === "name" ? nameError(raw) : name === "email" ? emailError(raw) : phoneError(raw);
    setErrs((e) => ({ ...e, [name]: v }));
    return v;
  };

  const onChange = (name: FieldName, raw: string) => {
    const v = name === "phone" ? formatPhoneKR(raw) : raw;
    setValues((s) => ({ ...s, [name]: v }));
    if (touched[name]) checkField(name, v);
  };

  const onBlur = (name: FieldName) => {
    setTouched((t) => ({ ...t, [name]: true }));
    checkField(name, values[name]);
  };

  useEffect(() => {
    if (!sticky) return;
    const el = formRef.current;
    if (!el) return;

    const sync = () => {
      const scrolled = window.scrollY > 320;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const formVisible = r.top < vh - 80 && r.bottom > 80;
      setShowBar(scrolled && !formVisible);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(() => sync(), { threshold: 0.15 });
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
    setError(null);

    const fieldErrs = validateLead(values);
    setErrs(fieldErrs);
    setTouched({ name: true, email: true, phone: true });
    if (hasErrors(fieldErrs)) {
      formRef.current
        ?.querySelector<HTMLInputElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }

    setLoading(true);
    const utm: Record<string, string> = {};
    const cookie = (n: string) =>
      typeof document !== "undefined"
        ? document.cookie.match(new RegExp(`(?:^|;\\s*)${n}=([^;]+)`))?.[1]
        : undefined;
    let fbclid: string | undefined;
    let landingUrl: string | undefined;
    let referrer: string | undefined;
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      q.forEach((v, k) => {
        if (k.startsWith("utm_")) utm[k] = v;
      });
      fbclid = q.get("fbclid") ?? undefined;
      landingUrl = window.location.href.slice(0, 500);
      referrer = document.referrer ? document.referrer.slice(0, 300) : undefined;
    }
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: phoneDigits(values.phone),
          utm,
          fbclid,
          fbc: cookie("_fbc"),
          fbp: cookie("_fbp"),
          landingUrl,
          referrer,
        }),
      });
      if (!res.ok) throw new Error("submit failed");
      const { leadId } = await res.json();
      track("lead", {}, leadId ? `lead.${leadId}` : undefined);
      setDone(true);
      router.push(`${nextPath}?l=${leadId}`);
    } catch {
      setError("잠시 후 다시 시도해 주세요. 계속 안 되면 새로고침해 주세요.");
      setLoading(false);
    }
  }

  const btnLabel = done
    ? "완료 ✓ 이동 중…"
    : loading
      ? "처리 중…"
      : submitLabel;

  return (
    <>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="my-5 rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-5"
      >
        {headline && (
          <p className="mb-3 text-center text-[15px] font-bold text-[var(--fn-ink)]">
            {headline}
          </p>
        )}
        <div className="space-y-2.5">
          <Field
            name="name"
            type="text"
            placeholder="이름"
            value={values.name}
            error={touched.name ? errs.name : null}
            onChange={onChange}
            onBlur={onBlur}
          />
          <Field
            name="email"
            type="email"
            placeholder="이메일 주소"
            value={values.email}
            error={touched.email ? errs.email : null}
            onChange={onChange}
            onBlur={onBlur}
          />
          <Field
            name="phone"
            type="tel"
            placeholder="휴대폰 번호"
            value={values.phone}
            error={touched.phone ? errs.phone : null}
            onChange={onChange}
            onBlur={onBlur}
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-[var(--fn-accent)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || done}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--fn-accent)] px-6 py-4 text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_var(--fn-accent)] transition active:scale-[0.99] disabled:opacity-60"
        >
          {loading || done ? (
            <>
              {(loading || done) && !error && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {btnLabel}
            </>
          ) : (
            <>
              {btnLabel}
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
  value,
  error,
  onChange,
  onBlur,
}: {
  name: FieldName;
  type: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (name: FieldName, v: string) => void;
  onBlur: (name: FieldName) => void;
}) {
  return (
    <div>
      <input
        name={name}
        type={type}
        inputMode={type === "tel" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={() => onBlur(name)}
        required
        aria-invalid={error ? "true" : undefined}
        placeholder={placeholder}
        autoComplete={
          name === "name" ? "name" : name === "email" ? "email" : "tel"
        }
        className={`w-full rounded-xl border bg-[var(--fn-field)] px-4 py-3.5 text-[15px] text-[var(--fn-ink)] outline-none transition placeholder:text-[var(--fn-sub)] focus:ring-4 ${
          error
            ? "border-[var(--fn-accent)] focus:border-[var(--fn-accent)] focus:ring-[var(--fn-accent)]/20"
            : "border-[var(--fn-line)] focus:border-[var(--fn-accent)] focus:ring-[var(--fn-accent)]/20"
        }`}
      />
      {error && (
        <p className="mt-1 pl-1 text-[12px] text-[var(--fn-accent)]">{error}</p>
      )}
    </div>
  );
}
