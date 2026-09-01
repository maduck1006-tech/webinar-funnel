import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLibrary } from "@/lib/library";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  course: "🎬",
  ebook: "📄",
  coaching: "💬",
  membership: "⭐",
  replay: "⏱",
};

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/library");

  const items = await getLibrary(user.id);

  return (
    <div className="funnel-theme funnel-shell min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-[560px]">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-[var(--fn-ink)]">
            내 라이브러리
          </h1>
          <LogoutButton />
        </div>
        <p className="mt-1 text-sm text-[var(--fn-sub)]">
          {user.name ? `${user.name}님, ` : ""}구매하신 콘텐츠예요.
        </p>

        <div className="mt-6 space-y-2.5">
          {items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--fn-line)] p-8 text-center text-sm text-[var(--fn-sub)]">
              아직 보유한 콘텐츠가 없어요.
            </div>
          )}
          {items.map((it) => (
            <a
              key={it.key}
              href={it.href}
              className="flex items-center gap-3 rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-4 transition hover:border-[var(--fn-accent)]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--fn-bg)] text-lg">
                {ICON[it.kind] ?? "📦"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-[var(--fn-ink)]">
                  {it.title}
                </span>
                <span className="block text-xs text-[var(--fn-sub)]">
                  {it.subtitle}
                </span>
              </span>
              <span className="text-[var(--fn-sub)]">→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
