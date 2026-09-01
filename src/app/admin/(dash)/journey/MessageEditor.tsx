import Link from "next/link";

/**
 * 여정 지도의 문자 상세 — 읽기 전용.
 * 실제 편집은 /admin/automation 에서 (docs/messaging-unification-plan.md).
 */
export function MessageEditor({
  template,
  offsetHours,
  enabled,
  sent,
  automationId,
}: {
  template: string;
  offsetHours: number | null;
  enabled: boolean;
  sent: number;
  automationId: string | null;
}) {
  const timing =
    offsetHours == null
      ? "이벤트 즉시"
      : offsetHours < 1
        ? `${Math.round(offsetHours * 60)}분 뒤`
        : `${offsetHours}시간 뒤`;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span
          className={`rounded px-1.5 py-0.5 ${
            enabled ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {enabled ? "켜짐" : "꺼짐"}
        </span>
        <span>{timing}</span>
        <span>· 누적 발송 {sent}건</span>
      </div>

      <pre className="whitespace-pre-wrap rounded-lg border bg-zinc-50 p-3 font-sans text-[13px] leading-relaxed text-zinc-700">
        {template || "(내용 없음)"}
      </pre>

      {automationId ? (
        <Link
          href={`/admin/automation/${automationId}`}
          className="inline-block rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white"
        >
          이 문자 편집 → 자동 메시지
        </Link>
      ) : (
        <Link
          href="/admin/automation"
          className="inline-block text-xs text-blue-600 underline"
        >
          자동 메시지에서 만들기 →
        </Link>
      )}
    </div>
  );
}
