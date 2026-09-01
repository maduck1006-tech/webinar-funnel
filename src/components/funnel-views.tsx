import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, type Campaign } from "@/db/schema";
import { enrollLead } from "@/lib/messaging";
import { FunnelPage } from "@/puck/FunnelPage";
import { PaidTracker } from "@/components/PaidTracker";
import { previewEnabled } from "@/lib/preview";
import { resolveLeadId } from "@/lib/lead";
import { resolveVariant } from "@/lib/ab";
import {
  campaignBasePath,
  checkoutRedirect,
} from "@/lib/campaign";
import { getActiveOffer, resolveCheckoutUrl } from "@/lib/funnel-offer";
import { grantEntitlement, hasEntitlement } from "@/lib/entitlements";
import { products } from "@/db/schema";

/** 2단계 — 랜딩(신청) */
export async function LandingView({ campaign }: { campaign: Campaign }) {
  const variant = campaign.abLanding ? await resolveVariant() : "a";
  return (
    <FunnelPage campaign={campaign} pageType="landing" variant={variant} />
  );
}

/** 3단계 — 땡큐 + 저가상품 */
export async function ThankYouView({
  campaign,
  l,
}: {
  campaign: Campaign;
  l?: string;
}) {
  const leadId = await resolveLeadId(l);
  const offer = await getActiveOffer(campaign.id, "thankyou");
  const basePath = campaignBasePath(campaign);
  return (
    <FunnelPage
      campaign={campaign}
      pageType="thankyou"
      metadata={{
        leadId: leadId ?? undefined,
        checkoutUrl: offer
          ? resolveCheckoutUrl(offer, { basePath, leadId })
          : undefined,
        productName: offer?.name,
        price: offer?.price,
        compareAt: offer?.compareAt ?? undefined,
      }}
    />
  );
}

/**
 * 웨비나형 퍼널의 종착 스텝 경로 (basePath + ?l= 포함).
 * campaign.terminalStep: 'booking' | 'groupchat' | 'sales'
 */
function terminalUrl(campaign: Campaign, leadId?: string | null): string {
  const base = campaignBasePath(campaign);
  const q = leadId ? `?l=${leadId}` : "";
  switch (campaign.terminalStep) {
    case "groupchat":
      return `${base}/community${q}`;
    case "sales":
      return `${base}/sales${q}`;
    default:
      return `${base}/booking${q}`;
  }
}

/** 4단계 — VOD 시청 (시청기한 게이팅) */
export async function VodView({
  campaign,
  l,
  preview,
  paid,
}: {
  campaign: Campaign;
  l?: string;
  preview?: string;
  paid?: string;
}) {
  const now = new Date();
  const windowH = campaign.vodWindowHours ?? 48;
  const offer = await getActiveOffer(campaign.id, "vod_bottom");
  const purchaseValue = offer?.price;
  const basePath = campaignBasePath(campaign);

  function meta(leadId: string | null, deadlineIso?: string) {
    return {
      vodDeadlineIso: deadlineIso,
      vodSrc: campaign.vodSrc ?? undefined,
      leadId: leadId ?? undefined,
      checkoutUrl: offer
        ? resolveCheckoutUrl(offer, { basePath, leadId })
        : undefined,
      productName: offer?.name,
      price: offer?.price,
      compareAt: offer?.compareAt ?? undefined,
      terminalUrl: terminalUrl(campaign, leadId),
      groupChatUrl: campaign.groupChatUrl ?? undefined,
    };
  }

  if (preview && previewEnabled()) {
    return (
      <FunnelPage
        campaign={campaign}
        pageType="vod"
        metadata={meta(
          null,
          new Date(now.getTime() + windowH * 3600 * 1000).toISOString(),
        )}
      />
    );
  }

  const leadId = await resolveLeadId(l);
  let gate: "ok" | "no-id" | "not-found" | "expired" = "ok";
  let deadlineIso: string | undefined;

  if (!leadId) {
    gate = "no-id";
  } else {
    try {
      const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
      if (!lead) {
        gate = "not-found";
      } else if (lead.vodExpiresAt.getTime() < now.getTime()) {
        gate = "expired";
        if (lead.firstWatchedAt && lead.status === "watching") {
          await db
            .update(leads)
            .set({ status: "watched", updatedAt: now })
            .where(eq(leads.id, lead.id));
        }
      } else {
        deadlineIso = lead.vodExpiresAt.toISOString();
        if (!lead.firstWatchedAt) {
          await db
            .update(leads)
            .set({
              firstWatchedAt: now,
              status: lead.status === "applied" ? "watching" : lead.status,
              updatedAt: now,
            })
            .where(eq(leads.id, lead.id));
          // 시청 시작 자동화(결제 유도 등) 등록 — 응답 후 백그라운드
          after(() =>
            enrollLead(lead.id, "watch_start", campaign.id).catch(() => {}),
          );
        }
      }
    } catch {
      gate = "ok";
    }
  }

  if (gate === "expired")
    return (
      <Gate title="시청 기간이 종료되었습니다">
        신청 시점으로부터 {windowH}시간이 지나 더 이상 시청할 수 없습니다.
      </Gate>
    );
  if (gate === "not-found")
    return <Gate title="잘못된 접근입니다">유효하지 않은 시청 링크입니다.</Gate>;
  if (gate === "no-id")
    return (
      <Gate title="시청 링크가 필요합니다">
        문자로 받으신 &quot;무료 강의 보러가기&quot; 링크로 접속해 주세요.
      </Gate>
    );

  const md = meta(leadId, deadlineIso);
  return (
    <FunnelPage campaign={campaign} pageType="vod" metadata={md}>
      {paid === "1" && (
        <PaidTracker leadId={leadId ?? undefined} value={purchaseValue} />
      )}
    </FunnelPage>
  );
}

/** 5단계 — 상담 예약 (되는시간 임베드) */
export async function BookingView({
  campaign,
  l,
}: {
  campaign: Campaign;
  l?: string;
}) {
  let embed = campaign.bookingEmbedUrl;
  // 신청자 정보를 예약 폼에 자동 전달
  if (embed) {
    const leadId = await resolveLeadId(l);
    if (leadId) {
      try {
        const [lead] = await db
          .select({
            name: leads.name,
            email: leads.email,
            phone: leads.phone,
          })
          .from(leads)
          .where(eq(leads.id, leadId));
        if (lead) {
          const sep = embed.includes("?") ? "&" : "?";
          // 되는시간(WhatTime) 게스트 폼 프리필 파라미터
          embed =
            embed +
            sep +
            new URLSearchParams({
              guest_name: lead.name ?? "",
              guest_email: lead.email,
              guest_phone: lead.phone,
            }).toString();
        }
      } catch {
        /* noop */
      }
    }
  }
  return (
    <FunnelPage campaign={campaign} pageType="booking">
      {embed ? (
        <iframe
          src={embed}
          className="mt-4 h-[720px] w-full rounded-xl border border-[var(--fn-line)] bg-white"
          title="상담 예약"
          loading="eager"
        />
      ) : (
        <div className="mt-4 grid h-56 place-items-center rounded-xl border border-dashed border-[var(--fn-line)] bg-[var(--fn-bg-2)] text-sm text-[var(--fn-sub)]">
          되는시간(WhatTime) 예약 캘린더가 여기 표시됩니다
        </div>
      )}
    </FunnelPage>
  );
}

/** 5단계(종착) — 무료 단톡방 입장 안내 */
export async function GroupChatView({
  campaign,
  l,
}: {
  campaign: Campaign;
  l?: string;
}) {
  const leadId = await resolveLeadId(l);
  const basePath = campaignBasePath(campaign);
  return (
    <FunnelPage
      campaign={campaign}
      pageType="groupchat"
      metadata={{
        leadId: leadId ?? undefined,
        basePath,
        groupChatUrl: campaign.groupChatUrl ?? undefined,
        terminalUrl: terminalUrl(campaign, leadId),
      }}
    >
      {!campaign.groupChatUrl && (
        <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-[var(--fn-line)] bg-[var(--fn-bg-2)] text-sm text-[var(--fn-sub)]">
          캠페인 설정에 단톡방 초대 링크를 입력하면 여기에 입장 버튼이 표시됩니다
        </div>
      )}
    </FunnelPage>
  );
}

/** 1단계 — 유료 상품(전자책/강의/상담) 세일즈페이지 */
export async function SalesView({
  campaign,
  l,
}: {
  campaign: Campaign;
  l?: string;
}) {
  const leadId = await resolveLeadId(l);
  const offer = await getActiveOffer(campaign.id, "sales");
  const basePath = campaignBasePath(campaign);
  return (
    <FunnelPage
      campaign={campaign}
      pageType="sales"
      metadata={{
        leadId: leadId ?? undefined,
        basePath,
        checkoutUrl: offer
          ? resolveCheckoutUrl(offer, { basePath, leadId })
          : undefined,
        productName: offer?.name,
        price: offer?.price,
        compareAt: offer?.compareAt ?? undefined,
      }}
    />
  );
}

/** 3단계 — 전자책 등 디지털 상품 다운로드 전달 (엔타이틀먼트 게이트) */
export async function DeliveryView({
  campaign,
  l,
  p,
}: {
  campaign: Campaign;
  l?: string;
  p?: string;
}) {
  const leadId = await resolveLeadId(l);
  const basePath = campaignBasePath(campaign);

  // 상품 미지정이면 이 캠페인의 세일즈 상품으로 폴백
  const offer = p ? null : await getActiveOffer(campaign.id, "sales");
  const productId = p || offer?.productId;

  if (!leadId || !productId) {
    return (
      <Gate title="다운로드 링크가 필요합니다">
        구매 확인 문자로 받으신 링크로 접속해 주세요.
      </Gate>
    );
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  if (!product) {
    return <Gate title="상품을 찾을 수 없습니다">유효하지 않은 링크입니다.</Gate>;
  }

  let ok = await hasEntitlement(leadId, productId);
  // 무료 상품인데 아직 엔타이틀먼트가 없으면(=랜딩폼으로 바로 진입) 즉시 부여
  if (!ok && product.priceMode === "free") {
    await grantEntitlement({ leadId, productId, product });
    ok = true;
  }

  if (!ok) {
    return (
      <Gate title="구매가 필요합니다">
        아직 구매하지 않은 상품이에요.{" "}
        <a href={`${basePath}/sales?l=${leadId}`} className="underline">
          세일즈 페이지로 이동
        </a>
      </Gate>
    );
  }

  const assetUrl =
    (product.delivery as { assetUrl?: string } | null)?.assetUrl ?? "";

  return (
    <FunnelPage
      campaign={campaign}
      pageType="delivery"
      metadata={{
        leadId,
        basePath,
        downloadUrl: assetUrl || undefined,
        productName: product.name,
      }}
    >
      {!assetUrl && (
        <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-[var(--fn-line)] bg-[var(--fn-bg-2)] text-sm text-[var(--fn-sub)]">
          상품 관리에서 전자책 파일 URL 을 입력하면 여기에 다운로드 버튼이 표시됩니다
        </div>
      )}
    </FunnelPage>
  );
}

function Gate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="funnel-theme funnel-shell grid min-h-dvh place-items-center px-6 text-center">
      <div className="fn-in max-w-sm rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-8 text-[var(--fn-ink)]">
        <h1 className="mb-2 text-xl font-bold">{title}</h1>
        <p className="text-[var(--fn-sub)]">{children}</p>
      </div>
    </div>
  );
}

/** 라우트에서 재사용: 캠페인 없으면 404 처리용 */
export { campaignBasePath, checkoutRedirect };
