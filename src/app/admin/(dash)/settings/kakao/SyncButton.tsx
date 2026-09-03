"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../form-ui";
import { runSync, type SyncState } from "./actions";

export function SyncButton({ disabled }: { disabled?: boolean }) {
  // 폼이 넘기는 (state, FormData) 는 무시하고 그냥 동기화만 실행
  const [state, action] = useActionState<SyncState>(() => runSync(), null);

  return (
    <form action={action} className="mt-3">
      <SubmitButton
        className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        pendingLabel="불러오는 중…"
      >
        {disabled ? "채널 연결 후 사용" : "솔라피에서 템플릿 불러오기"}
      </SubmitButton>
      {state?.ok && (
        <p className="mt-2 text-[12px] text-emerald-600">✓ {state.ok}</p>
      )}
      {state?.error && (
        <p className="mt-2 text-[12px] text-red-600">{state.error}</p>
      )}
    </form>
  );
}
