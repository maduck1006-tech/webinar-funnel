import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { campaigns } from "@/db/schema";
import { Card, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { CopyField } from "@/components/CopyField";
import { getActiveOffer } from "@/lib/funnel-offer";
import { getDefaultCampaign } from "@/lib/campaign";
import { TestSmsForm } from "./TestSmsForm";

export const dynamic = "force-dynamic";

function envSet(key: string) {
  return Boolean(process.env[key] && process.env[key] !== "");
}

export default async function SettingsPage() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://도메인미설정");
  const webhookUrl = `${site}/api/latpeed/webhook`;

  const defaultCampaign = await getDefaultCampaign();
  const [thankyouOffer, vodOffer] = defaultCampaign
    ? await Promise.all([
        getActiveOffer(defaultCampaign.id, "thankyou"),
        getActiveOffer(defaultCampaign.id, "vod_bottom"),
      ])
    : [null, null];

  let recentHooks: (typeof webhookEvents.$inferSelect)[] = [];
  let defaultBookingUrl: string | null = null;
  try {
    recentHooks = await db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(5);
    if (defaultCampaign) {
      const [c] = await db
        .select({ b: campaigns.bookingEmbedUrl, v: campaigns.vodSrc })
        .from(campaigns)
        .where(eq(campaigns.id, defaultCampaign.id));
      defaultBookingUrl = c?.b ?? null;
    }
  } catch {
    /* db 미연결 */
  }

  const solapiReady =
    envSet("SOLAPI_API_KEY") &&
    envSet("SOLAPI_API_SECRET") &&
    envSet("SOLAPI_SENDER");

  const checks = [
    { key: "DATABASE_URL", label: "데이터베이스 (Neon)" },
    { key: "CLERK_SECRET_KEY", label: "관리자 인증 (Clerk)" },
    { key: "SOLAPI_API_KEY", label: "솔라피 API 키" },
    { key: "SOLAPI_API_SECRET", label: "솔라피 API 시크릿" },
    { key: "SOLAPI_SENDER", label: "솔라피 발신번호" },
    { key: "BLOB_READ_WRITE_TOKEN", label: "이미지 업로드 (Vercel Blob)" },
    { key: "CRON_SECRET", label: "크론 보호 시크릿" },
    { key: "NEXT_PUBLIC_SITE_URL", label: "사이트 도메인" },
    { key: "LATPEED_WEBHOOK_SECRET", label: "래피드 웹훅 시크릿 (선택)" },
    { key: "NEXT_PUBLIC_VOD_SRC", label: "VOD 기본 영상 (선택·캠페인별 우선)" },
  ];

  return (
    <>
      <PageHeader
        title="연동 설정"
        desc="실사용 전 연결해야 하는 외부 서비스"
      />

      <div className="space-y-6">
        {/* 솔라피 (문자) — 가장 중요 */}
        <Card>
          <p className="flex items-center gap-2 text-sm font-bold">
            솔라피(Solapi) 문자
            <Tag tone={solapiReady ? "green" : "red"}>
              {solapiReady ? "연결됨" : "미연결"}
            </Tag>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            리마인더·결제완료 문자 발송에 필수. 미연결이면 자동 문자가 하나도 안
            나갑니다.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-zinc-600">
            <li>
              1. <a className="text-blue-600 underline" href="https://solapi.com" target="_blank" rel="noreferrer">solapi.com</a> 가입 → <b>발신번호 등록</b>(본인 인증) → API Key/Secret 발급
            </li>
            <li>
              2. Vercel 프로젝트 환경변수에 설정:{" "}
              <code>SOLAPI_API_KEY</code>, <code>SOLAPI_API_SECRET</code>,{" "}
              <code>SOLAPI_SENDER</code>(발신번호)
            </li>
            <li>
              3. 아래 버튼으로 테스트 발송 확인 (문자/LMS, 알림톡 심사 불필요)
            </li>
          </ol>
          <TestSmsForm />
          <Link
            href="/admin/automation"
            className="mt-3 inline-block text-xs text-blue-600 underline"
          >
            자동화에서 문자 문구 편집 →
          </Link>
        </Card>

        {/* 되는시간 */}
        <Card>
          <p className="flex items-center gap-2 text-sm font-bold">
            되는시간(WhatTime) 상담 예약
            <Tag tone={defaultBookingUrl ? "green" : "amber"}>
              {defaultBookingUrl ? "기본 캠페인 연결됨" : "미설정"}
            </Tag>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            5단계(상담 예약) 페이지에 임베드됩니다. 캠페인마다 다르게 설정
            가능합니다.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-zinc-600">
            <li>
              1. <a className="text-blue-600 underline" href="https://whattime.co.kr" target="_blank" rel="noreferrer">whattime.co.kr</a> 에서 상담 이벤트 만들고 <b>공유 링크</b> 복사 → <b>캠페인 → 설정 → “되는시간 임베드 URL”</b> 에 붙여넣기
              <div className="mt-1 text-xs text-zinc-400">
                신청자 이름·연락처가 자동으로 예약 폼에 전달됩니다(
                <code>?guest_name=&amp;guest_email=&amp;guest_phone=</code>).
              </div>
            </li>
            <li>
              2. <b>(선택) 예약 전환율 자동 집계</b> — 되는시간 <b>설정 → Webhooks</b> 에서
              아래 콜백 URL 등록 + <code>schedule_created</code>,{" "}
              <code>schedule_canceled</code> 체크:
              <div className="mt-1.5">
                <CopyField
                  value={`${site}/api/whattime/webhook${
                    envSet("WHATTIME_WEBHOOK_SECRET")
                      ? "?token=" + process.env.WHATTIME_WEBHOOK_SECRET
                      : ""
                  }`}
                />
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                예약 시 이메일 매칭으로 고객 상태가 “상담 예약완료”로 바뀌고
                대시보드 전환율에 반영됩니다.
              </div>
            </li>
          </ol>
          {defaultCampaign && (
            <Link
              href={`/admin/campaigns/${defaultCampaign.id}/settings`}
              className="mt-2 inline-block text-xs text-blue-600 underline"
            >
              기본 캠페인 설정 열기 →
            </Link>
          )}
        </Card>

        {/* 래피드 웹훅 */}
        <Card>
          <p className="text-sm font-bold">래피드(Latpeed) 결제 웹훅</p>
          <ol className="mt-3 space-y-3 text-sm text-zinc-600">
            <li>
              1. 래피드 상품/멤버십 관리 → <b>외부 툴 연동</b> 탭에서 아래 URL을
              웹훅 주소로 등록:
              <div className="mt-1.5">
                <CopyField value={webhookUrl} />
              </div>
            </li>
            <li>
              2. 웹훅 시크릿을 발급받아 환경변수{" "}
              <code>LATPEED_WEBHOOK_SECRET</code> 에 설정 (Vercel 프로젝트 설정).
              현재:{" "}
              <Tag tone={envSet("LATPEED_WEBHOOK_SECRET") ? "green" : "red"}>
                {envSet("LATPEED_WEBHOOK_SECRET") ? "설정됨" : "미설정"}
              </Tag>
              <p className="mt-1 text-xs text-zinc-400">
                서명 방식이 확정되지 않아 여러 포맷(HMAC 4종 + 공유토큰)을 자동
                시도합니다. 첫 결제가 들어오면 주문 관리의 웹훅 로그에{" "}
                <code>verified: ...</code> 로 어떤 방식이 맞았는지 표시됩니다.
              </p>
            </li>
            <li>
              3. 결제 완료 후 이동(리다이렉트) URL을 아래로 설정하면, 결제자가
              바로 강의 시청 페이지로 이동합니다:
              <div className="mt-1.5">
                <CopyField value={`${site}/vod?paid=1`} />
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                lead 식별은 브라우저 쿠키로 유지되므로 파라미터가 없어도
                동작합니다. 접근 권한 자체는 웹훅 수신 시 자동 부여됩니다.
              </p>
            </li>
          </ol>
        </Card>

        {/* 상품 ↔ 결제 연결 */}
        <Card>
          <p className="text-sm font-bold">상품 결제 URL 연결</p>
          <p className="mt-1 text-xs text-zinc-400">
            퍼널 빌더의 CTA 버튼 링크를 <code>{"{{checkout}}"}</code> 로 두면 아래
            상품의 래피드 결제 URL로 자동 연결됩니다.
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y">
              <OfferRow label="땡큐 페이지(3단계)" offer={thankyouOffer} />
              <OfferRow label="VOD 하단(4단계)" offer={vodOffer} />
            </tbody>
          </table>
          <Link
            href="/admin/products"
            className="mt-3 inline-block text-xs text-blue-600 underline"
          >
            상품 관리에서 결제 URL 입력 →
          </Link>
        </Card>

        {/* 환경변수 체크리스트 */}
        <Card>
          <p className="text-sm font-bold">환경변수 연결 상태</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {checks.map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <span>{c.label}</span>
                <Tag tone={envSet(c.key) ? "green" : "gray"}>
                  {envSet(c.key) ? "설정됨" : "미설정"}
                </Tag>
              </li>
            ))}
          </ul>
        </Card>

        {/* 최근 웹훅 */}
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">최근 웹훅 수신</p>
            <Link
              href="/admin/orders"
              className="text-xs text-blue-600 underline"
            >
              전체 보기 →
            </Link>
          </div>
          {recentHooks.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">아직 수신된 웹훅 없음</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {recentHooks.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2">
                  <span className="text-zinc-400">{fmtDate(h.createdAt)}</span>
                  <span>
                    {h.type ?? "—"}/{h.status ?? "—"}
                  </span>
                  <Tag tone={h.signatureValid ? "green" : "red"}>
                    {h.signatureValid ? "검증통과" : "검증실패"}
                  </Tag>
                  <span className="truncate text-xs text-zinc-400">
                    {h.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function OfferRow({
  label,
  offer,
}: {
  label: string;
  offer: Awaited<ReturnType<typeof getActiveOffer>>;
}) {
  return (
    <tr>
      <td className="py-2 font-medium">{label}</td>
      <td className="py-2">
        {offer ? (
          offer.checkoutUrl ? (
            <Tag tone="green">연결됨 · {offer.name}</Tag>
          ) : (
            <Tag tone="amber">상품 있음, 결제 URL 없음 · {offer.name}</Tag>
          )
        ) : (
          <Tag tone="gray">활성 상품 없음</Tag>
        )}
      </td>
    </tr>
  );
}
