"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };
type Section = { title?: string; items: Item[] };

const SECTIONS: Section[] = [
  { items: [{ href: "/admin", label: "오늘" }] },
  { items: [{ href: "/admin/campaigns", label: "캠페인" }] },
  {
    title: "고객",
    items: [
      { href: "/admin/crm", label: "연락처" },
      { href: "/admin/automation", label: "자동 메시지" },
      { href: "/admin/broadcasts", label: "브로드캐스트" },
    ],
  },
  {
    title: "상품",
    items: [
      { href: "/admin/products", label: "상품 관리" },
      { href: "/admin/coupons", label: "쿠폰" },
    ],
  },
  {
    title: "매출",
    items: [
      { href: "/admin/orders", label: "주문" },
      { href: "/admin/analytics", label: "광고 성과" },
    ],
  },
  { items: [{ href: "/admin/settings", label: "설정" }] },
];

export function Sidebar() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

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
                active(n.href)
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
