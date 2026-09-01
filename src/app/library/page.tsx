import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCrossSell, getLibrary, type LibraryItem } from "@/lib/library";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

const ICON: Record<LibraryItem["kind"], string> = {
  course: "🎬",
  ebook: "📄",
  coaching: "💬",
  membership: "⭐",
  replay: "⏱",
};

const GROUPS: { key: LibraryItem["kind"][]; label: string }[] = [
  { key: ["membership"], label: "멤버십" },
  { key: ["course", "coaching"], label: "강의 · 상담" },
  { key: ["ebook"], label: "다운로드 자료" },
  { key: ["replay"], label: "무료 강의 다시보기" },
];

function maskPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length < 10) return p;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

function Row({ it }: { it: LibraryItem }) {
  return (
    <a
      href={it.href}
      className={`flex items-center gap-3 rounded-2xl border bg-[var(--fn-bg-2)] p-3.5 transition hover:border-[var(--fn-accent)] ${
        it.urgent
          ? "border-[var(--fn-accent)]"
          : "border-[var(--fn-line)]"
      }`}
    >
      {it.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={it.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--fn-bg)] text-lg">
          {ICON[it.kind]}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-[var(--fn-ink)]">
          {it.title}
        </span>
        <span
          className={`block text-[12px] ${
            it.urgent ? "font-semibold text-[var(--fn-accent)]" : "text-[var(--fn-sub)]"
          }`}
        >
          {it.subtitle}
        </span>
      </span>
      <span className="shrink-0 text-[var(--fn-sub)]">→</span>
    </a>
  );
}

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/library");

  const [items, crossSell] = await Promise.all([
    getLibrary(user.id),
    getCrossSell(user.id),
  ]);
  const won = (n: number) => n.toLocaleString("ko-KR") + "원";

  return (
    <div className="funnel-theme funnel-shell min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-[520px]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-[var(--fn-ink)]">
              {user.name ? `${user.name}님의 보관함` : "내 보관함"}
            </h1>
            <p className="mt-1 text-[12.5px] text-[var(--fn-sub)]">
              {maskPhone(user.phone)}
            </p>
          </div>
          <LogoutButton />
        </div>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[var(--fn-line)] p-8 text-center">
            <p className="text-sm text-[var(--fn-ink)]">
              아직 보관함이 비어있어요
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fn-sub)]">
              결제하신 번호가 맞는지 확인해 주세요.
              <br />
              다른 번호로 신청하셨다면 그 번호로 다시 로그인해 주세요.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg border border-[var(--fn-line)] px-4 py-2 text-[12.5px] text-[var(--fn-ink)]"
            >
              다른 번호로 로그인
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {GROUPS.map((g) => {
              const rows = items.filter((it) => g.key.includes(it.kind));
              if (rows.length === 0) return null;
              return (
                <section key={g.label}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--fn-sub)]">
                    {g.label}
                  </p>
                  <div className="space-y-2">
                    {rows.map((it) => (
                      <Row key={it.key} it={it} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {crossSell.length > 0 && (
          <section className="mt-8">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--fn-accent)]">
              다음 단계
            </p>
            <div className="space-y-2">
              {crossSell.map((c) => (
                <a
                  key={c.productId}
                  href={c.href}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--fn-accent)]/40 bg-[var(--fn-accent)]/8 p-3.5 transition hover:border-[var(--fn-accent)]"
                >
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--fn-bg)] text-lg">
                      🚀
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold text-[var(--fn-accent)]">
                      {c.reason}
                    </span>
                    <span className="block truncate text-[14.5px] font-semibold text-[var(--fn-ink)]">
                      {c.title}
                    </span>
                    <span className="block text-[12px] text-[var(--fn-sub)]">
                      {c.compareAt && c.compareAt > c.price && (
                        <span className="mr-1 line-through">
                          {won(c.compareAt)}
                        </span>
                      )}
                      {won(c.price)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--fn-accent)]">→</span>
                </a>
              ))}
            </div>
          </section>
        )}

        <p className="mt-10 text-center text-[11px] text-[var(--fn-sub)]">
          링크가 안 열리거나 콘텐츠가 안 보이면 신청하신 문자로 문의해 주세요.
        </p>
      </div>
    </div>
  );
}
