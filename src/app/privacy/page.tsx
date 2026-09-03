import type { Metadata } from "next";
import { business as b } from "@/lib/business";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  robots: { index: false },
};

const rows: [string, string][] = [
  [
    "1. 수집하는 개인정보 항목",
    `${b.name}(이하 "회사")은 무료 강의 신청·상담 예약·상품 결제 과정에서 다음 정보를 수집합니다. (필수) 이름, 이메일 주소, 휴대전화번호 / (결제 시) 주문·결제 내역 / (자동수집) 접속 IP, 브라우저 정보, 쿠키, 광고 식별자(fbclid 등), 방문·시청 기록.`,
  ],
  [
    "2. 개인정보의 수집·이용 목적",
    "강의 시청 안내 및 링크 발송, 상담 예약 접수·안내, 상품 주문 처리 및 결제, 고객 문의 응대, 이벤트·혜택 안내 문자 발송, 서비스 개선 및 광고 성과 측정.",
  ],
  [
    "3. 보유 및 이용 기간",
    "수집일로부터 목적 달성 시까지 보유하며, 이후 지체 없이 파기합니다. 다만 관계 법령에 따라 전자상거래 등에서의 소비자 보호에 관한 법률 등이 정한 기간(계약·청약철회 기록 5년, 대금결제 및 재화 공급 기록 5년, 소비자 불만·분쟁처리 기록 3년) 동안 보관합니다.",
  ],
  [
    "4. 개인정보의 제3자 제공 및 처리위탁",
    "회사는 서비스 제공을 위해 다음 업체에 업무를 위탁합니다. · (주)토스페이먼츠 — 결제 처리 · (주)스무디(솔라피) — 알림 문자 발송 · 되는시간(WhatTime) — 상담 예약 관리 · Vercel Inc. — 서버 호스팅. 위탁 목적 외 이용을 금지하고 있습니다.",
  ],
  [
    "5. 이용자의 권리",
    "이용자는 언제든지 자신의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 아래 연락처로 요청 시 지체 없이 조치합니다. 문자 수신 거부는 수신 메시지 내 안내 또는 아래 연락처로 요청할 수 있습니다.",
  ],
  [
    "6. 개인정보 보호책임자",
    `${b.owner} / 이메일 ${b.email} / 전화 ${b.tel}`,
  ],
];

export default function PrivacyPage() {
  return (
    <div
      className="funnel-theme min-h-dvh"
      style={{ background: "var(--fn-bg)", color: "var(--fn-ink)" }}
    >
      <main className="mx-auto max-w-[640px] px-5 py-12">
        <h1 className="text-xl font-bold">개인정보처리방침</h1>
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
