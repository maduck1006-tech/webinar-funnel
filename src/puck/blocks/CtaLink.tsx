"use client";

import { track } from "@/lib/track";

/** CTA 링크. 결제(체크아웃) 링크면 클릭 시 checkout_start 이벤트 발화.
 *  외부 URL(http/https)은 새 탭으로 연다 — 결제창은 퍼널을 떠나지 않게. */
export function CtaLink({
  href,
  isCheckout,
  className,
  children,
}: {
  href: string;
  isCheckout: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const external = /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      className={className}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      onClick={() => {
        if (isCheckout) track("checkout_start");
      }}
    >
      {children}
    </a>
  );
}
