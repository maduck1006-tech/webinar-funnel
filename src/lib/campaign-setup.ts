import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignPages,
  campaignProducts,
  events,
  messageAutomations,
  products,
  type Campaign,
} from "@/db/schema";
import { getTemplate } from "@/lib/funnel-templates";
import { resolveFlowSteps, STEP_META } from "@/lib/funnel-flow";

export type CheckItem = {
  id: string;
  label: string;
  help?: string;
  done: boolean;
  required: boolean;
  href?: string;
  /** 인라인으로 채울 수 있는 항목 */
  inline?:
    | {
        kind: "product";
        slotKey: string;
        productType: string;
        priceMode: "paid" | "free";
      }
    | { kind: "setting"; field: "bookingEmbedUrl" | "groupChatUrl"; value: string };
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
}> {
  const id = campaign.id;
  const tpl = campaign.templateKey ? getTemplate(campaign.templateKey) : undefined;
  const steps = resolveFlowSteps(campaign).filter((s) => s.enabled);
  const stepTypes = new Set(steps.map((s) => s.pageType));

  const [mapped, pages, autoOff, ev] = await Promise.all([
    db
      .select({
        placement: campaignProducts.placement,
        price: products.price,
        active: products.active,
        type: products.type,
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
    db
      .select({ id: messageAutomations.id })
      .from(messageAutomations)
      .where(
        and(
          eq(messageAutomations.campaignId, id),
          eq(messageAutomations.enabled, false),
        ),
      ),
    db.select({ id: events.id }).from(events).where(eq(events.campaignId, id)),
  ]);

  const activeMapped = mapped.filter((m) => m.active);
  const hasPaidProduct = activeMapped.some((m) => m.price > 0);
  const pageData = new Map<string, string>(
    pages.map((p) => [String(p.pageType), JSON.stringify(p.data ?? {})]),
  );

  const funnelBuilder = `/admin/builder/${id}`;
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
      },
      required: true,
      href: settings,
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
      href: settings,
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
      href: funnelBuilder,
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
    href: funnelBuilder,
  });

  // 결제 연결
  const needsCheckout = stepTypes.has("sales") || stepTypes.has("thankyou");
  if (needsCheckout) {
    funnel.push({
      id: "payment",
      label: "결제 연결 (토스 + 상품)",
      help: !process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
        ? "NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정"
        : undefined,
      done: !!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY && hasPaidProduct,
      required: campaign.funnelType === "ebook" || campaign.funnelType === "vod_course",
      href: "/admin/products",
    });
  }

  /* ── 3. 후속 + 추적 ── */
  const followup: CheckItem[] = [
    {
      id: "automations",
      label:
        autoOff.length === 0
          ? "자동 메시지 검토·활성화 완료"
          : `자동 메시지 ${autoOff.length}개 검토 후 켜기`,
      help: "후속이 매출의 대부분입니다",
      done: autoOff.length === 0,
      required: false,
      href: `/admin/automation?campaign=${id}`,
    },
    {
      id: "pixel",
      label: "추적 픽셀 연결 (Meta 또는 GA4)",
      done: !!campaign.metaPixelId || !!campaign.ga4MeasurementId,
      required: false,
      href: settings,
    },
  ];

  const groups: SetupGroup[] = [
    { title: "1 · 오퍼 — 뭘 파는가", items: offer },
    { title: "2 · 퍼널 — 경로가 뚫렸는가", items: funnel },
    { title: "3 · 후속 · 추적 — 새는 곳은 없는가", items: followup },
  ];

  const all = groups.flatMap((g) => g.items);
  const req = all.filter((i) => i.required);
  return {
    groups,
    requiredDone: req.filter((i) => i.done).length,
    requiredTotal: req.length,
  };
}
