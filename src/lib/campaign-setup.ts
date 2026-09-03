import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignPages,
  campaignProducts,
  events,
  messageAutomations,
  messageAutomationSteps,
  products,
  type Campaign,
} from "@/db/schema";
import { getTemplate } from "@/lib/funnel-templates";
import { resolveFlowSteps, STEP_META } from "@/lib/funnel-flow";

/**
 * 자동 메시지(CRM) — 초보자용 '무엇을·왜' 안내.
 * key 별 친절 설명 + 꼭 켜야 하는지(essential) 여부.
 */
export const AUTOMATION_GUIDE: Record<
  string,
  { icon: string; what: string; essential: boolean }
> = {
  signup_confirm: {
    icon: "🎟️",
    what: "신청하자마자 시청 링크를 문자로 보냅니다. 이게 없으면 신청자가 강의를 못 찾아요. 반드시 켜두세요.",
    essential: true,
  },
  watch_deadline: {
    icon: "⏰",
    what: "48시간 무료 시청이 닫히기 전에 3번 리마인드합니다. '내일 봐야지' 하다 놓치는 사람을 붙잡아요.",
    essential: true,
  },
  payment_nudge: {
    icon: "💬",
    what: "강의를 열어본 사람에게 30분 뒤 상품을 안내합니다. 매출의 상당 부분이 여기서 나와요.",
    essential: true,
  },
  payment_done: {
    icon: "✅",
    what: "결제하면 '어디서 보는지' 안내 문자가 나갑니다. 없으면 '돈 냈는데요?' 문의가 옵니다.",
    essential: true,
  },
  soap_opera: {
    icon: "📖",
    what: "신청 후 5일간 당신의 이야기를 들려주는 시퀀스. 관계를 쌓아 결제·상담 전환을 올립니다. (선택 · 사전 교육 시퀀스와 하나만)",
    essential: false,
  },
  pre_launch: {
    icon: "🧠",
    what: "신청 후 3일간 '시간·돈·경험이 없다', '나는 재능이 없다', '이 방법은 나한텐 안 맞다' 세 가지 착각을 하나씩 깨는 교육 시퀀스. 강의를 보게 만들고 결제로 이어줍니다. 라이브 퍼널이면 신청~라이브 사이 빈 구간을 채워줘요. (선택 · 소프오페라와 하나만)",
    essential: false,
  },
  replay_close: {
    icon: "🔁",
    what: "강의를 보기 시작한 사람에게 마감까지 돈·시간·실행 자신 같은 망설임을 하나씩 반박하고 마지막에 마감으로 밀어붙입니다. 라이브 퍼널이면 리플레이 마감 시각이 자동으로 들어가요. '봤는데 안 산 사람'과 겹치면 하나만, 리플레이 창 길이에 맞춰 마지막 문자 시간을 조정하세요. (선택)",
    essential: false,
  },
  watched_no_buy: {
    icon: "👀",
    what: "강의는 봤는데 아직 안 산 사람에게 집중 리마인드. '결제 유도'와 겹치면 하나만 쓰세요. (선택)",
    essential: false,
  },
  cart_abandon: {
    icon: "🛒",
    what: "결제창까지 갔다가 나간 사람에게 '카드 문제였나요?' 복구 메시지. 이탈 매출을 되살립니다. (선택)",
    essential: false,
  },
  post_purchase_ascend: {
    icon: "🚀",
    what: "결제한 사람에게 온보딩 + 다음 상품 안내. 재구매·업셀용. (선택)",
    essential: false,
  },
};

export type SetupMessage = {
  automationId: string;
  key: string | null;
  name: string;
  enabled: boolean;
  icon: string;
  what: string;
  essential: boolean;
  firstBody: string;
  stepCount: number;
  isGlobal: boolean;
  editHref: string;
};

export type CheckItem = {
  id: string;
  label: string;
  help?: string;
  done: boolean;
  required: boolean;
  href?: string;
  /** 실제 사용자 화면을 새 탭에서 바로 보는 링크 */
  preview?: string;
  /** 인라인으로 채울 수 있는 항목 */
  inline?:
    | {
        kind: "product";
        slotKey: string;
        productType: string;
        priceMode: "paid" | "free";
      }
    | {
        kind: "offer-links";
        campaignId: string;
        products: { id: string; name: string; hasOffer: boolean }[];
      }
    | {
        kind: "product-connect";
        campaignId: string;
        newHref: string;
        options: { id: string; name: string; price: number }[];
      }
    | {
        kind: "setting";
        field:
          | "bookingEmbedUrl"
          | "groupChatUrl"
          | "vodSrc"
          | "metaPixelId";
        value: string;
        placeholder?: string;
      };
};

export type SetupGroup = {
  title: string; // 브런슨식 단계명
  items: CheckItem[];
};

const PLACEHOLDERS = [
  "제목을 입력하세요",
  "본문 텍스트",
  "헤드라인",
  "포인트 1",
  "후기를 넣으세요",
  "구성 항목",
  "이 상품이 무엇을 해결",
];

// 페이지에서 앞으로 가는 CTA 토큰이 하나라도 있나
const FORWARD_TOKENS = ["{{next}}", "{{checkout}}", "{{terminal}}", "{{live}}", "{{download}}", "{{groupchat}}"];

/**
 * 캠페인 발행 전 설정 체크리스트 (docs/funnel-templates-plan.md T2)
 * 브런슨식: 오퍼 → 퍼널 → 후속·추적 순. 필수/권장 구분, 발행은 막지 않음.
 */
export async function getSetupChecklist(campaign: Campaign): Promise<{
  groups: SetupGroup[];
  requiredDone: number;
  requiredTotal: number;
  messages: SetupMessage[];
  previewUrl: string;
}> {
  const id = campaign.id;
  const basePath = campaign.isDefault ? "" : `/${campaign.slug}`;
  // 관리자 전용 오버뷰(Clerk 보호) — 프로덕션에서도 열림
  const previewUrl = `/preview?campaign=${campaign.slug}`;
  const tpl = campaign.templateKey ? getTemplate(campaign.templateKey) : undefined;
  const steps = resolveFlowSteps(campaign).filter((s) => s.enabled);
  const stepTypes = new Set(steps.map((s) => s.pageType));

  const [mapped, pages, ev] = await Promise.all([
    db
      .select({
        productId: campaignProducts.productId,
        name: products.name,
        placement: campaignProducts.placement,
        price: products.price,
        active: products.active,
        type: products.type,
        bumpProductId: campaignProducts.bumpProductId,
        upsellProductId: campaignProducts.upsellProductId,
        downsellProductId: campaignProducts.downsellProductId,
      })
      .from(campaignProducts)
      .innerJoin(products, eq(products.id, campaignProducts.productId))
      .where(eq(campaignProducts.campaignId, id)),
    db
      .select({ pageType: campaignPages.pageType, data: campaignPages.data })
      .from(campaignPages)
      .where(
        and(eq(campaignPages.campaignId, id), eq(campaignPages.published, true)),
      ),
    db.select({ id: events.id }).from(events).where(eq(events.campaignId, id)),
  ]);

  const activeMapped = mapped.filter((m) => m.active);
  const hasPaidProduct = activeMapped.some((m) => m.price > 0);
  const hasOffers = mapped.some(
    (m) => m.bumpProductId || m.upsellProductId || m.downsellProductId,
  );
  const mappedIds = new Set(mapped.map((m) => m.productId));
  const connectable = (
    await db
      .select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .where(eq(products.active, true))
  ).filter((p) => !mappedIds.has(p.id));
  const pageData = new Map<string, string>(
    pages.map((p) => [String(p.pageType), JSON.stringify(p.data ?? {})]),
  );

  // Puck 빌더는 페이지 타입까지 필요: /admin/builder/[campaignId]/[pageType]
  const builderFor = (pageType: string) => `/admin/builder/${id}/${pageType}`;
  const funnelOverview = `/admin/campaigns/${id}/funnel`;
  const settings = `/admin/campaigns/${id}/settings`;

  /* ── 1. 오퍼 ── */
  const offer: CheckItem[] = [];

  if (tpl) {
    for (const slot of tpl.productSlots) {
      const filled = activeMapped.some(
        (m) => m.placement === slot.placement || m.placement === "both",
      );
      offer.push({
        id: `slot-${slot.key}`,
        label: slot.label,
        help:
          slot.priceMode === "free"
            ? "무료 상품 (가격 0)"
            : "상품을 만들면 이 퍼널에 자동 연결됩니다",
        done: filled,
        required: slot.required,
        inline: {
          kind: "product",
          slotKey: slot.key,
          productType: slot.productType,
          priceMode: slot.priceMode ?? "paid",
        },
      });
    }
  } else {
    offer.push({
      id: "any-product",
      label: "판매 상품 연결",
      help: "저가 상품 하나라도 이 퍼널에 매핑",
      done: activeMapped.length > 0,
      required: false,
      href: settings,
    });
  }

  // 종착별 필수 연결
  if (campaign.terminalStep === "booking" || stepTypes.has("booking")) {
    offer.push({
      id: "booking-url",
      label: "되는시간 예약 링크 연결",
      done: !!campaign.bookingEmbedUrl,
      required: true,
      inline: {
        kind: "setting",
        field: "bookingEmbedUrl",
        value: campaign.bookingEmbedUrl ?? "",
      },
    });
  }
  if (campaign.terminalStep === "groupchat" || stepTypes.has("groupchat")) {
    offer.push({
      id: "groupchat-url",
      label: "단톡방(오픈카톡) 초대 링크 연결",
      done: !!campaign.groupChatUrl,
      inline: {
        kind: "setting",
        field: "groupChatUrl",
        value: campaign.groupChatUrl ?? "",
        placeholder: "오픈카톡 초대 링크 (https://open.kakao.com/…)",
      },
      required: true,
    });
  }
  if (campaign.funnelType === "live_webinar_reg") {
    offer.push({
      id: "event",
      label: "라이브 회차 일정·유튜브 링크 등록",
      done: ev.length > 0,
      required: true,
      href: settings,
    });
  }
  if (stepTypes.has("vod") && campaign.funnelType !== "live_webinar_reg") {
    offer.push({
      id: "vod-src",
      label: "VOD 영상 링크 등록",
      done: !!campaign.vodSrc,
      required: true,
      inline: {
        kind: "setting",
        field: "vodSrc",
        value: campaign.vodSrc ?? "",
        placeholder: "YouTube · Vimeo 공유 링크 또는 MP4 URL",
      },
    });
  }

  /* ── 2. 퍼널 (경로) ── */
  const funnel: CheckItem[] = [];

  // 카피가 아직 기본값/플레이스홀더인 승부 페이지
  const copyPages = ["landing", "sales"].filter((pt) => stepTypes.has(pt));
  const copyPending = copyPages.filter((pt) => {
    const d = pageData.get(pt) ?? "";
    return PLACEHOLDERS.some((ph) => d.includes(ph));
  });
  if (copyPages.length > 0) {
    funnel.push({
      id: "copy",
      label:
        copyPending.length === 0
          ? "승부 페이지(랜딩·세일즈) 카피 채움"
          : `카피 채우기: ${copyPending
              .map((pt) => STEP_META[pt]?.title ?? pt)
              .join(", ")}`,
      help: "헤드라인이 전환을 만듭니다. 기본 문구 그대로 두지 마세요",
      done: copyPending.length === 0,
      required: false,
      href: builderFor(copyPending[0] ?? copyPages[0]),
      preview: `${basePath}${STEP_META[copyPending[0] ?? copyPages[0]]?.path ?? "/"}`,
    });
  }

  // 앞으로 가는 CTA 없는 중간 단계
  const deadEnds = steps.slice(0, -1).filter((s) => {
    const d = pageData.get(s.pageType);
    if (d === undefined) return false; // 앱 렌더 페이지(course 등)는 제외
    if (["course", "delivery", "booking", "groupchat"].includes(s.pageType))
      return false;
    return !FORWARD_TOKENS.some((t) => d.includes(t)) && !d.includes("LeadForm");
  });
  funnel.push({
    id: "links",
    label:
      deadEnds.length === 0
        ? "모든 단계가 다음으로 연결됨"
        : `연결 끊긴 단계: ${deadEnds
            .map((s) => STEP_META[s.pageType]?.title ?? s.pageType)
            .join(", ")}`,
    help: "각 페이지에 다음 단계 버튼({{next}}) 또는 결제 버튼({{checkout}})이 있어야 합니다",
    done: deadEnds.length === 0,
    required: deadEnds.length > 0,
    href: deadEnds[0]
      ? builderFor(deadEnds[0].pageType)
      : funnelOverview,
    preview: deadEnds[0]
      ? `${basePath}${STEP_META[deadEnds[0].pageType]?.path ?? "/"}`
      : undefined,
  });

  // 결제 연결 — 토스 연동(전역 1회)과 유료 상품 연결(캠페인별)을 분리
  const needsCheckout = stepTypes.has("sales") || stepTypes.has("thankyou");
  if (needsCheckout) {
    if (!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY) {
      funnel.push({
        id: "toss-key",
        label: "토스페이먼츠 연동 (모든 캠페인 공통 · 한 번만)",
        help: "설정 화면에서 토스 결제 키를 넣으면 모든 캠페인에 적용됩니다",
        done: false,
        required: true,
        href: `/admin/settings?return=${encodeURIComponent(
          `/admin/campaigns/${id}`,
        )}`,
      });
    }
    funnel.push({
      id: "paid-product",
      label: "유료 상품 연결",
      help: "이 퍼널에 가격이 있는 상품이 하나는 연결돼야 결제가 돌아갑니다",
      done: hasPaidProduct,
      required:
        campaign.funnelType === "ebook" || campaign.funnelType === "vod_course",
      inline: {
        kind: "product-connect",
        campaignId: id,
        newHref: `/admin/products/new?campaign=${id}&return=${encodeURIComponent(
          `/admin/campaigns/${id}`,
        )}`,
        options: connectable,
      },
      href: settings,
    });

    if (activeMapped.length > 0) {
      funnel.push({
        id: "offers",
        label: hasOffers
          ? "추가 매출(오더범프·업셀·다운셀) 설정됨"
          : "추가 매출 붙이기 — 오더범프·업셀·다운셀 (선택)",
        help: "결제 객단가를 올리는 장치. 상품마다 따로 지정합니다",
        done: hasOffers,
        required: false,
        inline: {
          kind: "offer-links",
          campaignId: id,
          products: activeMapped.map((m) => ({
            id: m.productId,
            name: m.name,
            hasOffer: Boolean(
              m.bumpProductId || m.upsellProductId || m.downsellProductId,
            ),
          })),
        },
      });
    }
  }

  /* ── 3. CRM 메시지 (자동으로 나가는 문자) ── */
  const autoRows = await db
    .select()
    .from(messageAutomations)
    .where(
      or(eq(messageAutomations.campaignId, id), isNull(messageAutomations.campaignId)),
    )
    .orderBy(asc(messageAutomations.createdAt));

  // key 별로 캠페인 전용본이 전역 기본을 덮어씀
  const overridden = new Set(
    autoRows.filter((a) => a.campaignId && a.key).map((a) => a.key),
  );
  const effective = autoRows.filter(
    (a) => a.campaignId || !(a.key && overridden.has(a.key)),
  );

  const messages: SetupMessage[] = (
    await Promise.all(
      effective.map(async (a) => {
        const steps = await db
          .select({
            body: messageAutomationSteps.body,
            enabled: messageAutomationSteps.enabled,
          })
          .from(messageAutomationSteps)
          .where(eq(messageAutomationSteps.automationId, a.id))
          .orderBy(asc(messageAutomationSteps.stepOrder));
        const bodies = steps.map((s) => s.body.trim()).filter(Boolean);
        // 내용이 비어있는 커스텀 자동화(설정 미완)는 체크리스트에서 숨김
        if (!a.key && bodies.length === 0) return null;
        const guide = a.key ? AUTOMATION_GUIDE[a.key] : undefined;
        return {
          automationId: a.id,
          key: a.key,
          name: a.name,
          enabled: a.enabled,
          icon: guide?.icon ?? "✉️",
          what:
            guide?.what ??
            "직접 만든 자동 메시지입니다. 내용을 확인하고 필요하면 켜세요.",
          essential: guide?.essential ?? false,
          firstBody: bodies[0] ?? "",
          stepCount: bodies.length,
          isGlobal: !a.campaignId,
          editHref: `/admin/automation/${a.id}`,
        } satisfies SetupMessage;
      }),
    )
  ).filter((m): m is SetupMessage => m !== null);
  // 꼭 켜야 하는 것 먼저, 그 다음 선택
  messages.sort((x, y) => Number(y.essential) - Number(x.essential));

  /* ── 4. 추적 ── */
  const followup: CheckItem[] = [
    {
      id: "pixel",
      label: "추적 픽셀 연결 (Meta 또는 GA4)",
      help: "GA4 등 나머지 추적 설정은 '설정' 탭에서",
      done: !!campaign.metaPixelId || !!campaign.ga4MeasurementId,
      required: false,
      inline: {
        kind: "setting",
        field: "metaPixelId",
        value: campaign.metaPixelId ?? "",
        placeholder: "Meta 픽셀 ID (숫자 15~16자리)",
      },
    },
  ];

  const groups: SetupGroup[] = [
    { title: "1 · 오퍼 — 뭘 파는가", items: offer },
    { title: "2 · 퍼널 — 경로가 뚫렸는가", items: funnel },
    { title: "4 · 추적 — 성과가 보이는가", items: followup },
  ];

  const all = groups.flatMap((g) => g.items);
  const req = all.filter((i) => i.required);
  return {
    groups,
    requiredDone: req.filter((i) => i.done).length,
    requiredTotal: req.length,
    messages,
    previewUrl,
  };
}
