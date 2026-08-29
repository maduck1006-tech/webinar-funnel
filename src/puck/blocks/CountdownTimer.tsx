"use client";

import { useEffect, useState } from "react";

export function CountdownTimer({
  label,
  deadlineIso,
  expiredText,
}: {
  label: string;
  deadlineIso: string;
  expiredText: string;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineIso) return;
    const target = new Date(deadlineIso).getTime();
    const tick = () => setLeft(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  if (left === null)
    return (
      <div className="my-4 rounded-xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] py-3 text-center text-sm text-[var(--fn-sub)]">
        {label}
      </div>
    );

  if (left <= 0)
    return (
      <div className="my-4 rounded-xl bg-[var(--fn-accent)] py-3 text-center text-sm font-bold text-white">
        {expiredText}
      </div>
    );

  const s = Math.floor(left / 1000);
  const parts = [
    { v: Math.floor(s / 3600), u: "시간" },
    { v: Math.floor((s % 3600) / 60), u: "분" },
    { v: s % 60, u: "초" },
  ];
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="my-4 rounded-xl border border-[var(--fn-accent)]/40 bg-[var(--fn-bg-2)] px-4 py-3 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fn-accent)]">
        {label}
      </p>
      <div className="mt-1.5 flex justify-center gap-2">
        {parts.map((p) => (
          <div
            key={p.u}
            className="min-w-[54px] rounded-lg bg-[var(--fn-field)] py-1.5"
          >
            <span className="block text-xl font-extrabold tabular-nums text-[var(--fn-ink)]">
              {pad(p.v)}
            </span>
            <span className="block text-[10px] text-[var(--fn-sub)]">{p.u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
