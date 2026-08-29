import type { ReactNode } from "react";
import { ClerkProvider, SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

/** 관리자 전체를 Clerk 로 보호. ADMIN_EMAILS 허용목록(설정 시)으로 추가 제한. */
export default async function AdminRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await currentUser().catch(() => null);

  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const blocked =
    !!user && allow.length > 0 && (!email || !allow.includes(email));

  return (
    <ClerkProvider>
      {blocked ? (
        <div className="grid min-h-dvh place-items-center bg-zinc-950 px-6 text-center text-zinc-100">
          <div>
            <h1 className="text-lg font-bold">접근 권한이 없습니다</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {email} 계정은 관리자 목록에 없습니다.
            </p>
            <SignOutButton>
              <button className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm">
                다른 계정으로 로그인
              </button>
            </SignOutButton>
          </div>
        </div>
      ) : (
        children
      )}
    </ClerkProvider>
  );
}
