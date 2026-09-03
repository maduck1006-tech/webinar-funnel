import Link from "next/link";
import { business as b } from "@/lib/business";

/**
 * 전 페이지 공통 푸터. 사업자 정보 + 정책 링크.
 * 퍼널 다크 테마(--fn-*) 토큰 사용. FunnelPage·checkout 등에서 렌더.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[560px] border-t border-[var(--fn-line)] px-5 py-7 text-[11px] leading-relaxed text-[var(--fn-sub)]">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>
        <Link href="/privacy" className="font-semibold underline underline-offset-2">
          개인정보처리방침
        </Link>
      </div>

      <dl className="mt-3 space-y-0.5">
        <div>
          <span className="text-[var(--fn-ink)]">{b.name}</span>
          {"  "}| 대표 {b.owner}
        </div>
        <div>사업자등록번호 {b.regNo}</div>
        <div>
          통신판매업신고{" "}
          {b.mailOrderNo ? b.mailOrderNo : "신고 면제 대상 (간이과세자)"}
        </div>
        <div>주소 {b.address}</div>
        <div>
          고객센터 {b.tel} · {b.email}
        </div>
      </dl>

      <p className="mt-3">
        입력하신 정보는 강의 안내 목적에만 사용되며 안전하게 보관됩니다.
      </p>
      <p className="mt-1">
        © {new Date().getFullYear()} {b.name}. All rights reserved.
      </p>
    </footer>
  );
}
