import type { Metadata } from "next";
import { business as b } from "@/lib/business";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "이용약관",
  robots: { index: false },
};

const rows: [string, string][] = [
  [
    "제1조 (목적)",
    `이 약관은 ${b.name}(이하 "회사")이 운영하는 웹사이트에서 제공하는 온라인 강의·상담·디지털 콘텐츠 판매 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자의 권리·의무를 규정함을 목적으로 합니다.`,
  ],
  [
    "제2조 (서비스의 제공)",
    "회사는 무료 강의 영상 시청, 유료 디지털 콘텐츠(워크북 등) 판매, 1:1 상담 예약을 제공합니다. 무료 강의는 신청 후 안내되는 기간 동안 시청할 수 있습니다.",
  ],
  [
    "제3조 (결제)",
    "유료 상품의 대금 결제는 신용카드 등 회사가 제공하는 결제수단으로 하며, 결제 대행은 (주)토스페이먼츠를 통해 이루어집니다. 표시된 금액은 부가세를 포함합니다.",
  ],
  [
    "제4조 (청약철회 및 환불)",
    "이용자는 결제일로부터 7일 이내에 청약을 철회할 수 있습니다. 다만 다운로드가 완료되었거나 열람으로 이용이 개시된 디지털 콘텐츠는 전자상거래법 제17조 제2항에 따라 청약철회가 제한될 수 있으며, 이 경우 상품 구매 화면에 그 사실을 표시합니다. 환불 요청은 아래 고객센터로 접수하며 영업일 기준 3일 이내 처리합니다.",
  ],
  [
    "제5조 (저작권)",
    "서비스에서 제공하는 모든 강의·자료의 저작권은 회사에 있으며, 이용자는 이를 무단으로 복제·배포·공유할 수 없습니다.",
  ],
  [
    "제6조 (면책)",
    "회사는 이용자가 서비스를 통해 얻은 정보로 인해 발생한 사업상 결과에 대해 보증하지 않으며, 천재지변 등 불가항력으로 인한 서비스 중단에 책임을 지지 않습니다.",
  ],
  [
    "제7조 (문의)",
    `서비스 이용 관련 문의: 전화 ${b.tel} / 이메일 ${b.email}`,
  ],
];

export default function TermsPage() {
  return (
    <div
      className="funnel-theme min-h-dvh"
      style={{ background: "var(--fn-bg)", color: "var(--fn-ink)" }}
    >
      <main className="mx-auto max-w-[640px] px-5 py-12">
        <h1 className="text-xl font-bold">이용약관</h1>
        <p className="mt-2 text-[13px] text-[var(--fn-sub)]">
          시행일: 2024년 11월 21일
        </p>
        <div className="mt-8 space-y-7">
          {rows.map(([h, body]) => (
            <section key={h}>
              <h2 className="text-[15px] font-semibold">{h}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--fn-sub)]">
                {body}
              </p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
