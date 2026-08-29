"use client";

import { useActionState } from "react";
import { sendTestSms, type TestResult } from "./actions";

export function TestSmsForm() {
  const [state, action, pending] = useActionState<TestResult | null, FormData>(
    sendTestSms,
    null,
  );
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <input
        name="to"
        placeholder="010-0000-0000"
        className="w-40 rounded border px-2 py-1"
      />
      <button
        disabled={pending}
        className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
      >
        {pending ? "발송 중…" : "테스트 문자 발송"}
      </button>
      {state && (
        <span className={state.ok ? "text-green-600" : "text-red-600"}>
          {state.message}
        </span>
      )}
    </form>
  );
}
