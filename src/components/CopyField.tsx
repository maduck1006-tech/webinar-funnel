"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border bg-zinc-50 px-3 py-2 text-xs">
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            /* noop */
          }
        }}
        className="shrink-0 rounded-lg border px-3 text-xs font-medium"
      >
        {done ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
