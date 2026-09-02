import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "./Sidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-theme funnel-theme flex min-h-dvh bg-zinc-50 text-zinc-900">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-white">
        <div className="border-b px-4 py-4 text-sm font-bold">
          웨비나 퍼널 · 관리자
        </div>
        <Sidebar />
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
