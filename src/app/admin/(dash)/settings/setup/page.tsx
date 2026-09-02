import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { Tag } from "@/components/admin-ui";
import { CopyField } from "@/components/CopyField";
import { getDefaultCampaign } from "@/lib/campaign";
import { Wizard, WizardShell, type WizardStep } from "../../_wizard";
import { TestSmsForm } from "../TestSmsForm";

export const dynamic = "force-dynamic";

function envSet(key: string) {
  return Boolean(process.env[key] && process.env[key] !== "");
}

function Status({ ok, okText = "연결됨", noText = "아직 안 됨" }: {
  ok: boolean;
  okText?: string;
  noText?: string;
}) {
  return (
    <Tag tone={ok ? "green" : "amber"}>{ok ? `✓ ${okText}` : noText}</Tag>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-zinc-600">
      {children}
    </ol>
  );
}

function EnvNote({ keys }: { keys: string[] }) {
  return (
    <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500">
      Vercel 프로젝트 → Settings → Environment Variables 에 넣는 값
      <ul className="mt-1.5 space-y-1">
        {keys.map((k) => (
          <li key={k} className="flex items-center justify-between gap-2">
            <code className="font-mono text-[11.5px]">{k}</code>
            <Tag tone={envSet(k) ? "green" : "gray"}>
              {envSet(k) ? "설정됨" : "미설정"}
            </Tag>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-zinc-400">
        값을 넣은 뒤에는 <b>재배포</b>해야 반영됩니다.
      </p>
    </div>
  );
}

export default async function SetupWizardPage() {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://도메인미설정");

  const defaultCampaign = await getDefaultCampaign();
  let bookingUrl: string | null = null;
  let pixelOn = false;
  if (defaultCampaign) {
    try {
      const [c] = await db
        .select({
          b: campaigns.bookingEmbedUrl,
          px: campaigns.metaPixelId,
          ga: campaigns.ga4MeasurementId,
        })
        .from(campaigns)
        .where(eq(campaigns.id, defaultCampaign.id));
      bookingUrl = c?.b ?? null;
      pixelOn = Boolean(c?.px || c?.ga);
    } catch {
      /* db 미연결 */
    }
  }

  const smsOk =
    envSet("SOLAPI_API_KEY") &&
    envSet("SOLAPI_API_SECRET") &&
    envSet("SOLAPI_SENDER");
  const tossOk =
    envSet("NEXT_PUBLIC_TOSS_CLIENT_KEY") && envSet("TOSS_SECRET_KEY");
  const campaignSettings = defaultCampaign
    ? `/admin/campaigns/${defaultCampaign.id}/settings`
    : "/admin/campaigns";

  const steps: WizardStep[] = [
    {
      key: "sms",
      title: "1. 문자 발송 (솔라피)",
      sub: "가장 중요합니다. 이게 없으면 자동 문자가 하나도 안 나가고, 퍼널 매출의 절반이 사라집니다.",
      body: (
        <>
          <Status ok={smsOk} />
          <Steps>
            <li>
              1.{" "}
              <a
                className="text-blue-600 underline"
                href="https://solapi.com"
                target="_blank"
                rel="noreferrer"
              >
                solapi.com
              </a>{" "}
              가입 → <b>발신번호 등록</b>(본인 인증) → API Key / Secret 발급
            </li>
            <li>2. 아래 세 값을 환경변수에 넣고 재배포</li>
            <li>3. 아래 버튼으로 실제로 문자가 오는지 확인</li>
          </Steps>
          <EnvNote
            keys={["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER"]}
          />
          <div className="mt-3">
            <TestSmsForm />
          </div>
        </>
      ),
    },
    {
      key: "toss",
      title: "2. 결제 받기 (토스페이먼츠)",
      sub: "유료 상품을 팔려면 필요합니다. 한 번만 연결하면 모든 캠페인에 적용돼요.",
      body: (
        <>
          <Status ok={tossOk} />
          <Steps>
            <li>
              1.{" "}
              <a
                className="text-blue-600 underline"
                href="https://app.tosspayments.com/signup"
                target="_blank"
                rel="noreferrer"
              >
                토스페이먼츠
              </a>{" "}
              가입 → 전자결제 신청 → <b>결제 클라이언트 키 / 시크릿 키</b> 발급
            </li>
            <li>
              2. 두 값을 환경변수에 <b>한 세트로</b> 넣고 재배포
            </li>
            <li>
              3. 결제가 끝나면 손님은 자동으로{" "}
              <code className="text-[11.5px]">/vod?paid=1</code> 로 이동하고, 접근
              권한은 서버 승인 시점에 부여됩니다.
            </li>
          </Steps>
          <EnvNote keys={["NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY"]} />
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-[12px] leading-relaxed text-blue-900">
            💡 키를 넣었다고 끝이 아니에요. <b>어떤 상품을 팔지</b>는 캠페인마다
            따로 연결합니다 —{" "}
            <Link href={campaignSettings} className="font-semibold underline">
              캠페인 설정 → 연결 상품
            </Link>
          </p>
        </>
      ),
    },
    {
      key: "booking",
      title: "3. 상담 예약 (되는시간)",
      sub: "퍼널 마지막이 '상담 예약'인 경우에만 필요합니다. 아니면 건너뛰세요.",
      body: (
        <>
          <Status
            ok={!!bookingUrl}
            okText="기본 캠페인 연결됨"
            noText="아직 안 됨 (필요할 때만)"
          />
          <Steps>
            <li>
              1.{" "}
              <a
                className="text-blue-600 underline"
                href="https://whattime.co.kr"
                target="_blank"
                rel="noreferrer"
              >
                whattime.co.kr
              </a>{" "}
              에서 상담 이벤트를 만들고 <b>공유 링크</b>를 복사
            </li>
            <li>
              2. 그 링크를{" "}
              <Link href={campaignSettings} className="text-blue-600 underline">
                캠페인 설정 → 되는시간 임베드 URL
              </Link>{" "}
              에 붙여넣기 (캠페인마다 다르게 쓸 수 있어요)
              <div className="mt-1 text-[11.5px] text-zinc-400">
                신청자 이름·연락처는 예약 폼에 자동으로 채워집니다.
              </div>
            </li>
            <li>
              3. <b>(선택) 예약 전환율 자동 집계</b> — 되는시간 설정 → Webhooks 에
              아래 URL 등록 + <code className="text-[11.5px]">schedule_created</code>
              , <code className="text-[11.5px]">schedule_canceled</code> 체크
              <div className="mt-1.5">
                <CopyField
                  value={`${site}/api/whattime/webhook${
                    envSet("WHATTIME_WEBHOOK_SECRET")
                      ? "?token=" + process.env.WHATTIME_WEBHOOK_SECRET
                      : ""
                  }`}
                />
              </div>
            </li>
          </Steps>
        </>
      ),
    },
    {
      key: "pixel",
      title: "4. 광고 성과 추적 (선택)",
      sub: "메타·구글 광고를 돌릴 계획이 있을 때만. 나중에 해도 됩니다.",
      body: (
        <>
          <Status
            ok={pixelOn}
            okText="기본 캠페인에 픽셀 연결됨"
            noText="아직 안 됨 (선택)"
          />
          <Steps>
            <li>
              1. Meta 픽셀 ID(숫자 15~16자리) 또는 GA4 측정 ID를{" "}
              <Link href={campaignSettings} className="text-blue-600 underline">
                캠페인 설정
              </Link>{" "}
              에 넣기 — <b>캠페인마다 다른 픽셀</b>을 쓸 수 있습니다
            </li>
            <li>
              2. (심화) 서버 전환 전송·광고비 리포트를 쓰려면 아래 토큰까지
            </li>
          </Steps>
          <EnvNote
            keys={["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_CAPI_TOKEN"]}
          />
          <p className="mt-3 text-[12px] text-zinc-400">
            연결하면 <Link href="/admin/analytics" className="underline">광고 성과 리포트</Link>
            에서 광고비 대비 매출(ROAS)까지 볼 수 있어요.
          </p>
        </>
      ),
    },
    {
      key: "done",
      title: "정리",
      sub: "지금 상태예요. 못 한 건 나중에 다시 와서 채워도 됩니다.",
      body: (
        <>
          <dl className="divide-y rounded-xl border text-sm">
            <div className="flex items-center justify-between px-3 py-2.5">
              <dt>문자 발송</dt>
              <dd>
                <Status ok={smsOk} />
              </dd>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <dt>결제 받기</dt>
              <dd>
                <Status ok={tossOk} />
              </dd>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <dt>상담 예약</dt>
              <dd>
                <Status ok={!!bookingUrl} noText="선택" />
              </dd>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <dt>광고 추적</dt>
              <dd>
                <Status ok={pixelOn} noText="선택" />
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-[13px] leading-relaxed text-blue-900">
            <b>다음은 캠페인이에요.</b> 퍼널을 하나 만들면, 그 안의{" "}
            <b>설정 체크리스트</b>가 남은 걸 하나씩 알려줍니다.
            <Link
              href="/admin/campaigns/new"
              className="mt-2 block rounded-lg bg-black py-2 text-center text-sm font-semibold text-white"
            >
              새 캠페인 만들기 →
            </Link>
          </div>
        </>
      ),
    },
  ];

  return (
    <WizardShell
      title="처음 설정 마법사"
      exitHref="/admin/settings"
      exitLabel="전체 설정 화면"
    >
      <Wizard steps={steps} doneHref="/admin/settings" doneLabel="설정 화면으로" />
    </WizardShell>
  );
}
