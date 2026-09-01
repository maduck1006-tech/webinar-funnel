"use client";

import { useActionState } from "react";
import {
  enrollInSequence,
  forceStatus,
  regrantAccess,
  resendMessage,
  type ActionResult,
} from "./actions";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p className={`mt-1 text-xs ${state.ok ? "text-green-600" : "text-red-600"}`}>
      {state.message}
    </p>
  );
}

export function ManualActions({
  leadId,
  statusOptions,
  currentStatus,
  sequences = [],
}: {
  leadId: string;
  statusOptions: [string, string][];
  currentStatus: string;
  sequences?: { id: string; name: string }[];
}) {
  const [enrollState, enrollAction, enrollPending] = useActionState<
    ActionResult | null,
    FormData
  >(enrollInSequence, null);
  const [resendState, resendAction, resendPending] = useActionState<
    ActionResult | null,
    FormData
  >(resendMessage, null);
  const [regrantState, regrantAction, regrantPending] = useActionState<
    ActionResult | null,
    FormData
  >(regrantAccess, null);
  const [statusState, statusAction, statusPending] = useActionState<
    ActionResult | null,
    FormData
  >(forceStatus, null);

  return (
    <div className="space-y-3 text-sm">
      {sequences.length > 0 && (
        <form action={enrollAction} className="space-y-1">
          <input type="hidden" name="leadId" value={leadId} />
          <select
            name="sequenceId"
            defaultValue=""
            className="w-full rounded border px-2 py-1"
          >
            <option value="" disabled>
              문자 시퀀스 선택…
            </option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            disabled={enrollPending}
            className="w-full rounded-lg border py-2 disabled:opacity-50"
          >
            {enrollPending ? "등록 중…" : "시퀀스에 등록"}
          </button>
          <Result state={enrollState} />
        </form>
      )}

      <form action={resendAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="trigger" value="signup_confirm" />
        <button
          disabled={resendPending}
          className="w-full rounded-lg border py-2 disabled:opacity-50"
        >
          {resendPending ? "발송 중…" : "시청 안내 문자 재발송"}
        </button>
        <Result state={resendState} />
      </form>

      <form action={regrantAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <button
          disabled={regrantPending}
          className="w-full rounded-lg border py-2 disabled:opacity-50"
        >
          {regrantPending ? "처리 중…" : "시청 권한 재부여 (48h 연장)"}
        </button>
        <Result state={regrantState} />
      </form>

      <form action={statusAction} className="space-y-1">
        <input type="hidden" name="leadId" value={leadId} />
        <select
          name="status"
          defaultValue={currentStatus}
          className="w-full rounded border px-2 py-1"
        >
          {statusOptions.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          disabled={statusPending}
          className="w-full rounded-lg border py-2 disabled:opacity-50"
        >
          {statusPending ? "변경 중…" : "상태 강제 변경"}
        </button>
        <Result state={statusState} />
      </form>
    </div>
  );
}
