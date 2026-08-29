"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opt = { id: string; name: string; isDefault: boolean };

/** ?campaign= 쿼리로 캠페인 필터. 값이 없으면 "전체". */
export function CampaignFilter({ options }: { options: Opt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("campaign") ?? "";

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs text-zinc-500">캠페인</span>
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set("campaign", e.target.value);
          else next.delete("campaign");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="rounded border px-2 py-1"
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.isDefault ? " (기본)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
