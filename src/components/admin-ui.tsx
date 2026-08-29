import type { ReactNode } from "react";

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {desc && <p className="mt-1 text-sm text-zinc-500">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${className}`}>{children}</div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function Tag({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "red" | "blue" | "amber";
}) {
  const tones = {
    gray: "bg-zinc-100 text-zinc-600",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-zinc-400">
        {text}
      </td>
    </tr>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  applied: "신청완료",
  watching: "시청시작",
  watched: "시청완료",
  purchased: "저가구매완료",
  booked: "상담예약완료",
  consulted: "상담완료",
  expired: "미시청만료",
  no_purchase: "구매안함",
};

export function statusTone(s: string): "gray" | "green" | "red" | "blue" | "amber" {
  if (s === "purchased" || s === "consulted") return "green";
  if (s === "expired" || s === "no_purchase") return "red";
  if (s === "booked") return "blue";
  if (s === "watching" || s === "watched") return "amber";
  return "gray";
}

export function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
