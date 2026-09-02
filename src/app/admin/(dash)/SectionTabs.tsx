"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SETS: Record<string, { label: string; href: string }[]> = {
  customer: [
    { label: "연락처", href: "/admin/crm" },
    { label: "자동 메시지", href: "/admin/automation" },
    { label: "브로드캐스트", href: "/admin/broadcasts" },
  ],
  product: [
    { label: "상품", href: "/admin/products" },
    { label: "쿠폰", href: "/admin/coupons" },
  ],
  revenue: [
    { label: "주문", href: "/admin/orders" },
    { label: "광고 성과", href: "/admin/analytics" },
  ],
};

export function SectionTabs({ set }: { set: keyof typeof SETS }) {
  const pathname = usePathname();
  const tabs = SETS[set] ?? [];
  return (
    <div className="mb-5 flex gap-1 border-b border-zinc-200">
      {tabs.map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
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
