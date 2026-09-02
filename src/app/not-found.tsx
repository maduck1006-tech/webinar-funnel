import Link from "next/link";

export default function NotFound() {
  return (
    <div className="funnel-theme funnel-shell grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-5xl">🧭</p>
        <h1 className="mt-4 text-xl font-bold text-[var(--fn-ink)]">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--fn-sub)]">
          주소가 바뀌었거나 링크가 만료됐을 수 있어요.
          <br />
          문자로 받으신 링크를 다시 확인해 주세요.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-xl bg-[var(--fn-accent)] px-5 py-3 text-[14px] font-bold text-white"
          >
            처음으로
          </Link>
          <Link
            href="/library"
            className="rounded-xl border border-[var(--fn-line)] px-5 py-3 text-[14px] font-semibold text-[var(--fn-ink)]"
          >
            내 콘텐츠 보관함
          </Link>
        </div>
      </div>
    </div>
  );
}
