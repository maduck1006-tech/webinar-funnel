import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";

const nav = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/campaigns", label: "캠페인" },
  { href: "/admin/flow", label: "퍼널 흐름도" },
  { href: "/admin/products", label: "상품 관리" },
  { href: "/admin/crm", label: "CRM 고객" },
  { href: "/admin/journey", label: "여정 지도" },
  { href: "/admin/automation", label: "자동화" },
  { href: "/admin/orders", label: "결제/주문" },
  { href: "/admin/settings", label: "연동 설정" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme funnel-theme flex min-h-dvh bg-zinc-50 text-zinc-900">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-white">
        <div className="border-b px-4 py-4 text-sm font-bold">
          웨비나 퍼널 · 관리자
        </div>
        <nav className="flex flex-1 flex-col p-2">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <UserButton
            showName
            appearance={{ elements: { userButtonBox: "flex-row-reverse" } }}
          />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
