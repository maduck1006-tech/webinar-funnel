"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/library";

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error || "발송에 실패했어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setSent(true);
        setMsg("입력한 번호로 인증번호가 발송되었어요.");
      }
    } catch {
      setErr("네트워크 오류입니다.");
    }
    setBusy(false);
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error || "인증에 실패했어요.");
      } else {
        router.replace(next);
      }
    } catch {
      setErr("네트워크 오류입니다.");
    }
    setBusy(false);
  }

  return (
    <div className="funnel-theme funnel-shell grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-[420px] rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-7">
        <h1 className="text-2xl font-extrabold text-[var(--fn-ink)]">환영해요</h1>
        <p className="mt-2 text-sm text-[var(--fn-sub)]">
          단 10초, 인증 한 번으로 내 강의·자료를 다시 열 수 있어요.
        </p>

        <div className="my-5 h-px bg-[var(--fn-line)]" />

        <label className="block">
          <span className="text-[13px] font-semibold text-[var(--fn-ink)]">
            휴대폰 번호 <span className="text-[var(--fn-accent)]">*</span>
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="휴대폰 번호를 입력해 주세요"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            disabled={sent}
            className="mt-1.5 w-full rounded-xl border border-[var(--fn-line)] bg-[var(--fn-bg)] px-4 py-3 text-sm text-[var(--fn-ink)] placeholder:text-[var(--fn-sub)] focus:border-[var(--fn-accent)] focus:outline-none disabled:opacity-60"
          />
        </label>

        {sent && (
          <>
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="인증번호를 입력해 주세요"
              inputMode="numeric"
              autoFocus
              className="mt-2 w-full rounded-xl border border-[var(--fn-line)] bg-[var(--fn-bg)] px-4 py-3 text-sm tracking-[0.3em] text-[var(--fn-ink)] placeholder:tracking-normal placeholder:text-[var(--fn-sub)] focus:border-[var(--fn-accent)] focus:outline-none"
            />
            {msg && (
              <p className="mt-2 rounded-lg bg-[var(--fn-bg)] px-3 py-2 text-xs text-[var(--fn-sub)]">
                {msg}{" "}
                <button
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    setMsg(null);
                  }}
                  className="ml-1 underline"
                >
                  번호 수정
                </button>
              </p>
            )}
          </>
        )}

        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}

        <button
          onClick={sent ? verify : sendCode}
          disabled={
            busy ||
            (!sent && phone.replace(/\D/g, "").length < 10) ||
            (sent && code.length < 6)
          }
          className="mt-4 w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--fn-accent)" }}
        >
          {busy
            ? "확인 중…"
            : sent
              ? "인증하고 시작하기"
              : "인증번호 받기"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
