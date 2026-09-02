"use client";

import { useFormStatus } from "react-dom";

/**
 * 서버 액션 폼 제출 버튼 — 진행 중 상태 표시 + 중복 제출 방지.
 * <form action={serverAction}> 안에서만 동작.
 */
export function SubmitButton({
  children,
  className = "",
  pendingLabel = "저장 중…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * 파괴적 액션(삭제 등) 확인 버튼 — 클릭 시 confirm() 후 제출.
 * confirm 취소하면 제출되지 않음.
 */
export function ConfirmSubmit({
  children,
  message,
  className = "",
  pendingLabel = "처리 중…",
  formAction,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  pendingLabel?: string;
  /** 폼의 action 대신 이 버튼만 다른 서버 액션으로 제출할 때 */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (!pending && !window.confirm(message)) e.preventDefault();
      }}
      className={`${className} disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
