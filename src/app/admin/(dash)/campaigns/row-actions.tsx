"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteCampaign, renameCampaign, setCampaignStatus } from "./actions";

export function EditableName({
  id,
  name,
  isTemplate,
}: {
  id: string;
  name: string;
  isTemplate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(renameCampaign, null);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Link
          href={`/admin/campaigns/${id}`}
          className="text-blue-600 underline"
        >
          {name}
        </Link>
        {isTemplate && (
          <span className="text-xs text-zinc-400">(템플릿)</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-400 underline hover:text-zinc-600"
        >
          이름수정
        </button>
        {state?.error && (
          <span className="text-xs text-red-600">{state.error}</span>
        )}
      </span>
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => setTimeout(() => setEditing(false), 0)}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        autoFocus
        maxLength={60}
        className="w-40 rounded border px-2 py-1 text-sm"
      />
      <button
        disabled={pending}
        className="rounded bg-black px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        저장
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-zinc-400 underline"
      >
        취소
      </button>
    </form>
  );
}

export function DeleteCampaignButton({
  id,
  name,
  disabled,
}: {
  id: string;
  name: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(deleteCampaign, null);

  if (disabled) return null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`"${name}" 캠페인을 삭제할까요? 되돌릴 수 없습니다.`)) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        {pending ? "삭제 중…" : "삭제"}
      </button>
      {state?.error && (
        <p className="mt-1 max-w-[220px] text-right text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * 보관 / 보관 해제.
 * 신청자·주문이 붙은 캠페인은 삭제가 막히는데, 그때 안내하는 대안이 이것이다.
 * (상태만 바꾸므로 데이터는 그대로 남는다)
 */
export function ArchiveCampaignButton({
  id,
  name,
  archived,
  disabled,
}: {
  id: string;
  name: string;
  archived: boolean;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <form
      action={setCampaignStatus}
      onSubmit={(e) => {
        if (
          !archived &&
          !confirm(
            `"${name}" 캠페인을 보관할까요?\n페이지가 더 이상 열리지 않지만 신청자·주문 기록은 그대로 남습니다.`,
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={archived ? "draft" : "archived"} />
      <button className="text-xs text-zinc-500 underline">
        {archived ? "보관 해제" : "보관"}
      </button>
    </form>
  );
}
