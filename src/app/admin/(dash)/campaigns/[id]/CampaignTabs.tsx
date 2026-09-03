"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CampaignTabs({
  id,
  slug,
  live,
}: {
  id: string;
  slug: string;
  /** 라이브 웨비나 캠페인에서만 '라이브 안내' 탭을 띄운다 */
  live?: boolean;
}) {
  const pathname = usePathname();
  const tabs = [
    { label: "개요", href: `/admin/campaigns/${id}`, match: `/admin/campaigns/${id}` },
    {
      label: "퍼널",
      href: `/admin/campaigns/${id}/funnel`,
      match: `/admin/campaigns/${id}/funnel`,
    },
    ...(live
      ? [
          {
            label: "라이브 안내",
            href: `/admin/campaigns/${id}/live`,
            match: `/admin/campaigns/${id}/live`,
          },
        ]
      : []),
    {
      label: "자동 메시지",
      href: `/admin/automation?campaign=${id}`,
      match: "/admin/automation",
    },
    {
      label: "지표",
      href: `/admin/analytics?campaign=${id}`,
      match: "/admin/analytics",
    },
    {
      label: "설정",
      href: `/admin/campaigns/${id}/settings`,
      match: `/admin/campaigns/${id}/settings`,
    },
  ];

  return (
    <div className="mb-5 flex gap-1 border-b border-zinc-200">
      {tabs.map((t) => {
        const on =
          t.match === `/admin/campaigns/${id}`
            ? pathname === t.match
            : pathname.startsWith(t.match);
        return (
          <Link
            key={t.label}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              on
                ? "border-zinc-900 font-semibold text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
