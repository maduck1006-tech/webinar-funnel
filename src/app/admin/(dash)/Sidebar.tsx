"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Section = { title?: string; items: Item[] };

/** group: 이 항목이 활성으로 보일 하위 경로들 (SectionTabs 와 짝) */
const SECTIONS: (Section & { items: (Item & { group?: string[] })[] })[] = [
  { items: [{ href: "/admin", label: "오늘" }] },
  { items: [{ href: "/admin/campaigns", label: "캠페인" }] },
  {
    items: [
      {
        href: "/admin/crm",
        label: "고객",
        group: ["/admin/crm", "/admin/automation", "/admin/broadcasts"],
      },
      {
        href: "/admin/products",
        label: "상품",
        group: ["/admin/products", "/admin/coupons"],
      },
      {
        href: "/admin/orders",
        label: "매출",
        group: ["/admin/orders", "/admin/analytics", "/admin/affiliates"],
      },
    ],
  },
  { items: [{ href: "/admin/settings", label: "설정" }] },
];

export function Sidebar() {
  const pathname = usePathname();
  const matches = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");
  const active = (n: Item & { group?: string[] }) =>
    n.group ? n.group.some(matches) : matches(n.href);

  return (
    <nav className="flex flex-1 flex-col gap-3 p-2">
      {SECTIONS.map((s, i) => (
        <div key={i}>
          {s.title && (
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {s.title}
            </p>
          )}
          {s.items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-md px-3 py-1.5 text-sm ${
                active(n)
                  ? "bg-zinc-900 font-semibold text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
