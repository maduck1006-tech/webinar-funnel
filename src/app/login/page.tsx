"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** 01012345678 → 010-1234-5678 (입력 중 표시용) */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/library";

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);
  const digits = phone.replace(/\D/g, "");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function sendCode() {
    if (busy || digits.length < 10) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error || "발송에 실패했어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setStage("code");
        setCooldown(60);
        setTimeout(() => codeRef.current?.focus(), 50);
      }
    } catch {
      setErr("연결 상태를 확인하고 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  async function verify() {
    if (busy || code.length < 6) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, code }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error || "인증번호를 다시 확인해 주세요.");
        setCode("");
      } else {
        router.replace(next);
      }
    } catch {
      setErr("연결 상태를 확인하고 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  return (
    <div className="funnel-theme funnel-shell grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6">
          <h1 className="text-[22px] font-extrabold text-[var(--fn-ink)]">
            {stage === "phone" ? "내 콘텐츠 보관함" : "인증번호를 넣어주세요"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--fn-sub)]">
            {stage === "phone" ? (
              <>
                결제하셨던 번호를 넣으면 문자로 숫자 6자리가 갑니다.
                <br />
                비밀번호도, 가입도 없어요.
              </>
            ) : (
              <>
                <span className="font-semibold text-[var(--fn-ink)]">
                  {formatPhone(phone)}
                </span>{" "}
                로 보낸 6자리를 넣어주세요.
              </>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-5">
          {stage === "phone" ? (
            <>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--fn-sub)]">
                휴대폰 번호
              </label>
              <input
                value={formatPhone(phone)}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="010-0000-0000"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                autoFocus
                className="w-full rounded-xl border border-[var(--fn-line)] bg-[var(--fn-bg)] px-4 py-3.5 text-[15px] tracking-wide text-[var(--fn-ink)] placeholder:text-[var(--fn-sub)] focus:border-[var(--fn-accent)] focus:outline-none"
              />
            </>
          ) : (
            <>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--fn-sub)]">
                인증번호 6자리
              </label>
              <input
                ref={codeRef}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={(e) => e.key === "Enter" && verify()}
                placeholder="——————"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full rounded-xl border border-[var(--fn-line)] bg-[var(--fn-bg)] px-4 py-3.5 text-center text-[20px] font-bold tracking-[0.4em] text-[var(--fn-ink)] placeholder:tracking-[0.2em] placeholder:text-[var(--fn-line)] focus:border-[var(--fn-accent)] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between text-[12px]">
                <button
                  onClick={() => {
                    setStage("phone");
                    setCode("");
                    setErr(null);
                  }}
                  className="text-[var(--fn-sub)] underline"
                >
                  번호 바꾸기
                </button>
                <button
                  onClick={sendCode}
                  disabled={cooldown > 0 || busy}
                  className="text-[var(--fn-accent)] underline disabled:text-[var(--fn-sub)] disabled:no-underline"
                >
                  {cooldown > 0 ? `재전송 ${cooldown}초` : "인증번호 재전송"}
                </button>
              </div>
            </>
          )}

          {err && (
            <p className="mt-2.5 text-[12.5px] text-red-400">{err}</p>
          )}

          <button
            onClick={stage === "phone" ? sendCode : verify}
            disabled={
              busy ||
              (stage === "phone" ? digits.length < 10 : code.length < 6)
            }
            className="mt-3.5 w-full rounded-xl py-3.5 text-[15px] font-bold text-white transition disabled:opacity-40"
            style={{ background: "var(--fn-accent)" }}
          >
            {busy
              ? "잠시만요…"
              : stage === "phone"
                ? "인증번호 받기"
                : "보관함 열기"}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--fn-sub)]">
          입력하신 번호는 본인 확인과 콘텐츠 제공에만 사용됩니다.
        </p>
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
