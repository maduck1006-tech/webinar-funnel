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
import {
  getRegisteredEvent,
  replayClosesAt,
  replayOpensAt,
} from "@/lib/events";
import { getEntitlement, grantEntitlement, hasEntitlement } from "@/lib/entitlements";
import { hasActiveSubscription } from "@/lib/subscriptions";
import {
  getCourseByProduct,
  getProgress,
  lessonUnlocked,
  youtubeEmbedUrl,
} from "@/lib/courses";
import {
  lastEnabledStep,
  nextEnabledStep,
  resolveFlowSteps,
  stepPath,
} from "@/lib/funnel-flow";
import { products } from "@/db/schema";

/** 2단계 — 랜딩(신청) */
export async function LandingView({ campaign }: { campaign: Campaign }) {
  const variant = campaign.abLanding ? await resolveVariant() : "a";
  const basePath = campaignBasePath(campaign);
  const next = nextEnabledStep(resolveFlowSteps(campaign), "landing");
  return (
    <FunnelPage
      campaign={campaign}
      pageType="landing"
      variant={variant}
      metadata={{
        nextStepPath: next ? stepPath(next, basePath) : `${basePath}/thankyou`,
      }}
    />
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

  let eventStartsAtIso: string | undefined;
  let liveUrl: string | undefined;
  if (campaign.funnelType === "live_webinar_reg" && leadId) {
    const event = await getRegisteredEvent(leadId);
    eventStartsAtIso = event?.startsAt.toISOString();
    liveUrl = event?.externalLiveUrl ?? undefined;
  }

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
        eventStartsAtIso,
        liveUrl,
        nextStepUrl: nextStepUrl(campaign, "thankyou", leadId),
        nextStepPath: (() => {
          const next = nextEnabledStep(resolveFlowSteps(campaign), "thankyou");
          return next ? stepPath(next, basePath) : `${basePath}/vod`;
        })(),
      }}
    />
  );
}

/**
 * 웨비나형 퍼널의 종착 스텝 경로 (basePath + ?l= 포함).
 * flow 의 마지막 enabled 단계 우선, 없으면 campaign.terminalStep.
 */
function terminalUrl(campaign: Campaign, leadId?: string | null): string {
  const base = campaignBasePath(campaign);
  const last = lastEnabledStep(resolveFlowSteps(campaign));
  const target = last ?? campaign.terminalStep ?? "booking";
  return stepPath(target, base, leadId);
}

/** 현재 단계 다음 enabled 단계 경로 (없으면 종착으로 폴백) */
function nextStepUrl(
  campaign: Campaign,
  current: string,
  leadId?: string | null,
): string {
  const base = campaignBasePath(campaign);
  const next = nextEnabledStep(resolveFlowSteps(campaign), current);
  return next ? stepPath(next, base, leadId) : terminalUrl(campaign, leadId);
}

/** live_webinar_reg 전용 VOD 게이팅 — 회차(event) 시작/종료 기준 */
async function renderLiveReplayGate({
  campaign,
  leadId,
  meta,
  purchaseValue,
  paid,
}: {
  campaign: Campaign;
  leadId: string | null;
  meta: (leadId: string | null, deadlineIso?: string) => Record<string, unknown>;
  purchaseValue: number | undefined;
  paid?: string;
}) {
  if (!leadId) {
    return (
      <Gate title="시청 링크가 필요합니다">
        문자로 받으신 신청 확인 링크로 접속해 주세요.
      </Gate>
    );
  }

  const event = await getRegisteredEvent(leadId);
  if (!event) {
    return (
      <Gate title="예정된 회차가 없습니다">
        관리자에게 문의해 주세요. (캠페인에 라이브 일정이 설정돼 있지 않습니다)
      </Gate>
    );
  }
  if (event.status === "canceled") {
    return <Gate title="이 회차는 취소되었습니다">다음 안내를 기다려 주세요.</Gate>;
  }

  const now = new Date();
  const opensAt = replayOpensAt(event);
  const closesAt = replayClosesAt(event);
  const when = event.startsAt.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  if (now < event.startsAt) {
    return (
      <Gate title="아직 시작 전이에요">
        {when}에 라이브로 진행됩니다. 시작 전 문자로 입장 링크를 다시 보내드려요.
      </Gate>
    );
  }

  if (now < opensAt) {
    return (
      <Gate title="지금 라이브 진행 중">
        {event.externalLiveUrl ? (
          <a
            href={event.externalLiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-lg bg-[var(--fn-accent)] px-5 py-2.5 font-bold text-white"
          >
            라이브 입장하기 →
          </a>
        ) : (
          "문자로 받으신 라이브 링크로 입장해 주세요."
        )}
        <br />
        <span className="mt-2 block text-xs">
          방송이 끝나면 이 페이지에서 리플레이가 자동으로 열립니다.
        </span>
      </Gate>
    );
  }

  if (now >= closesAt) {
    return (
      <Gate title="리플레이 기간이 종료되었습니다">
        라이브 종료로부터 {event.replayWindowHours}시간이 지나 더 이상 시청할 수
        없습니다.
      </Gate>
    );
  }

  // 리플레이 시청 가능 구간
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (lead && !lead.firstWatchedAt) {
    await db
      .update(leads)
      .set({
        firstWatchedAt: now,
        status: lead.status === "applied" ? "watching" : lead.status,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));
    after(() =>
      enrollLead(lead.id, "watch_start", campaign.id).catch(() => {}),
    );
  }

  const md = {
    ...meta(leadId, closesAt.toISOString()),
    vodSrc: event.replayUrl || campaign.vodSrc || undefined,
  };
  return (
    <FunnelPage campaign={campaign} pageType="vod" metadata={md}>
      {paid === "1" && (
        <PaidTracker leadId={leadId ?? undefined} value={purchaseValue} />
      )}
    </FunnelPage>
  );
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
      nextStepUrl: nextStepUrl(campaign, "vod", leadId),
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

  // 라이브 웨비나 신청 퍼널: 신청시각+48h 가 아니라 회차(event) 기준으로 게이팅.
  // 라이브 종료(startsAt+durationMin) 전엔 리플레이 비공개, 종료 후 replayWindowHours 동안 공개.
  if (campaign.funnelType === "live_webinar_reg") {
    return renderLiveReplayGate({ campaign, leadId, meta, purchaseValue, paid });
  }

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
  // 활성 멤버십이 있으면 접근 허용
  if (!ok && (await hasActiveSubscription(leadId))) ok = true;

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

/** 3단계 — VOD 강의 강의실 (엔타이틀먼트 게이트, 드립 오픈) */
export async function CourseView({
  campaign,
  l,
  lesson,
}: {
  campaign: Campaign;
  l?: string;
  lesson?: string;
}) {
  const leadId = await resolveLeadId(l);
  const basePath = campaignBasePath(campaign);
  const offer = await getActiveOffer(campaign.id, "sales");

  if (!leadId || !offer) {
    return (
      <Gate title="강의실 접근이 필요합니다">
        구매 확인 문자로 받으신 링크로 접속해 주세요.
      </Gate>
    );
  }

  const ent = await getEntitlement(leadId, offer.productId);
  const member = ent ? false : await hasActiveSubscription(leadId);
  if (!ent && !member) {
    return (
      <Gate title="구매가 필요합니다">
        아직 구매하지 않은 강의예요.{" "}
        <a href={`${basePath}/sales?l=${leadId}`} className="underline">
          세일즈 페이지로 이동
        </a>
      </Gate>
    );
  }

  const tree = await getCourseByProduct(offer.productId);
  if (!tree || tree.modules.every((m) => m.lessons.length === 0)) {
    return (
      <Gate title="강의 준비 중입니다">
        상품 관리에서 강의 모듈/레슨을 등록하면 여기에 표시됩니다.
      </Gate>
    );
  }

  const allLessons = tree.modules.flatMap((m) => m.lessons);
  const unlockedLessons = allLessons.filter((ls) =>
    lessonUnlocked(ls, ent?.grantedAt ?? new Date(0)),
  );
  const current =
    unlockedLessons.find((ls) => ls.id === lesson) ?? unlockedLessons[0];
  const done = await getProgress(leadId);

  const qs = (lessonId: string) =>
    `${basePath}/course?l=${leadId}&lesson=${lessonId}`;

  return (
    <div className="funnel-theme funnel-shell min-h-dvh">
      <div className="fn-in mx-auto max-w-3xl px-5 py-8">
        <h1 className="mb-1 text-xl font-bold text-[var(--fn-ink)]">
          {tree.course.title}
        </h1>
        {tree.course.description && (
          <p className="mb-6 text-sm text-[var(--fn-sub)]">
            {tree.course.description}
          </p>
        )}

        {current ? (
          <div className="mb-6">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                key={current.id}
                src={youtubeEmbedUrl(current.videoRef)}
                className="h-full w-full"
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-semibold text-[var(--fn-ink)]">{current.title}</p>
              <form action={markCompleteAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="lessonId" value={current.id} />
                <input type="hidden" name="redirect" value={qs(current.id)} />
                <button
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    done.has(current.id)
                      ? "border-[var(--fn-accent)] text-[var(--fn-accent)]"
                      : "border-[var(--fn-line)] text-[var(--fn-sub)]"
                  }`}
                >
                  {done.has(current.id) ? "✓ 완료함" : "완료 표시"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="mb-6 grid h-56 place-items-center rounded-xl border border-dashed border-[var(--fn-line)] text-sm text-[var(--fn-sub)]">
            아직 열린 레슨이 없습니다
          </div>
        )}

        <div className="space-y-5">
          {tree.modules.map((m) => (
            <div key={m.id}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--fn-sub)]">
                {m.title}
              </p>
              <ul className="space-y-1">
                {m.lessons.map((ls) => {
                  const unlocked = lessonUnlocked(ls, ent?.grantedAt ?? new Date(0));
                  const isCurrent = current?.id === ls.id;
                  return (
                    <li key={ls.id}>
                      {unlocked ? (
                        <a
                          href={qs(ls.id)}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                            isCurrent
                              ? "bg-[var(--fn-accent)]/10 text-[var(--fn-accent)]"
                              : "text-[var(--fn-ink)] hover:bg-[var(--fn-bg-2)]"
                          }`}
                        >
                          <span className="w-4 shrink-0">
                            {done.has(ls.id) ? "✓" : "▶"}
                          </span>
                          {ls.title}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--fn-sub)]">
                          <span className="w-4 shrink-0">🔒</span>
                          {ls.title}
                          <span className="ml-auto text-[11px]">
                            {ls.dripDays}일 뒤 오픈
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function markCompleteAction(fd: FormData) {
  "use server";
  const { markLessonComplete } = await import("@/lib/courses");
  const leadId = String(fd.get("leadId") ?? "");
  const lessonId = String(fd.get("lessonId") ?? "");
  const redirectTo = String(fd.get("redirect") ?? "/");
  if (leadId && lessonId) await markLessonComplete(leadId, lessonId);
  const { redirect } = await import("next/navigation");
  redirect(redirectTo);
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
