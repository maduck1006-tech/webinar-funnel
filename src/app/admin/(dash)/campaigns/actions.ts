"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignPages,
  campaignProducts,
  campaignSlugRedirects,
  campaigns,
  events,
  leads,
  messageAutomations,
  messageAutomationSteps,
  orders,
  pendingOrders,
  products,
  subscriptions,
} from "@/db/schema";
import { getTemplate } from "@/lib/funnel-templates";
import { bustAbCache, isValidSlug } from "@/lib/campaign";
import { FUNNEL_PAGE_TYPES } from "@/lib/flow-types";
import {
  insertStepOrdered,
  resolveFlowSteps,
  seedFlow,
} from "@/lib/funnel-flow";
import { defaultPages } from "@/puck/defaults";

/**
 * 위저드용 래퍼 — 조용히 실패하지 않고 사람이 읽을 수 있는 오류를 돌려준다.
 * (createCampaign 은 이름/슬러그가 잘못되면 그냥 return 해서 화면에 아무 일도 안 일어남)
 */
export async function createCampaignWizard(
  _prev: { error?: string } | null,
  fd: FormData,
): Promise<{ error?: string }> {
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "")
    .trim()
    .toLowerCase();
  if (!name) return { error: "캠페인 이름을 입력해주세요." };
  if (!isValidSlug(slug))
    return {
      error:
        "주소는 영문 소문자·숫자·하이픈(-)만 쓸 수 있어요. 예: sales-webinar-mar",
    };
  const [dup] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.slug, slug));
  if (dup)
    return { error: `'${slug}' 주소는 이미 쓰고 있어요. 다른 주소를 넣어주세요.` };

  // 성공하면 내부에서 redirect() 가 throw 되어 여기로 안 돌아옴
  await createCampaign(fd);
  return { error: "캠페인을 만들지 못했어요. 입력값을 확인해주세요." };
}

/** 템플릿/기존 캠페인에서 복제해 새 캠페인 생성 */
export async function createCampaign(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const sourceId = String(fd.get("sourceId") ?? "").trim() || null;
  const templateKey = String(fd.get("templateKey") ?? "").trim() || null;
  const template = templateKey ? getTemplate(templateKey) : undefined;
  if (!name || !isValidSlug(slug)) return;

  const [dup] = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
  if (dup) return;

  const funnelType = template?.funnelType ?? "evergreen_webinar";
  const terminalStep = template?.terminalStep ?? "booking";

  const [created] = await db
    .insert(campaigns)
    .values({
      name,
      slug,
      status: "draft",
      funnelType,
      terminalStep,
      templateKey: template?.key ?? null,
      flow: template
        ? { steps: template.steps.map((pt) => ({ pageType: pt, enabled: true })) }
        : seedFlow({ funnelType, terminalStep }),
    })
    .returning();

  // 템플릿: 페이지(템플릿 카피 or 기본값) + CRM 자동화(캠페인 전용·꺼짐) 시드
  if (template && !sourceId) {
    for (const pt of FUNNEL_PAGE_TYPES) {
      await db.insert(campaignPages).values({
        campaignId: created.id,
        pageType: pt,
        version: 1,
        published: true,
        data: (template.pageOverrides?.[pt] ??
          defaultPages[pt] ??
          defaultPages.landing) as object,
      });
    }
    // 전역 자동화 중 이 퍼널에서 끌 것 → 캠페인 전용본 enabled=false
    for (const gk of template.disableGlobal ?? []) {
      await db
        .insert(messageAutomations)
        .values({
          campaignId: created.id,
          key: gk,
          name: `${gk} (이 퍼널에선 사용 안 함)`,
          trigger: "signup",
          enabled: false,
          stopOn: [],
        })
        .onConflictDoNothing();
    }
    // 템플릿 전용 자동화
    for (const a of template.automations) {
      const [row] = await db
        .insert(messageAutomations)
        .values({
          campaignId: created.id,
          key: a.key,
          name: a.name,
          trigger: a.trigger,
          enabled: a.enabled ?? false,
          stopOn: a.stopOn,
        })
        .returning({ id: messageAutomations.id });
      await db.insert(messageAutomationSteps).values(
        a.steps.map((s, i) => ({
          automationId: row.id,
          stepOrder: i + 1,
          delayMinutes: s.delayMinutes,
          audience: s.audience,
          body: s.body,
        })),
      );
    }
    revalidatePath("/admin/campaigns");
    redirect(`/admin/campaigns/${created.id}`);
  }

  // 소스 캠페인 설정/페이지/상품 복제
  if (sourceId) {
    const [src] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, sourceId));
    if (src) {
      await db
        .update(campaigns)
        .set({
          vodWindowHours: src.vodWindowHours,
          countdownMode: src.countdownMode,
          countdownRushSeconds: src.countdownRushSeconds,
          funnelType: src.funnelType,
          terminalStep: src.terminalStep,
          groupChatUrl: src.groupChatUrl,
          flow: src.flow ?? seedFlow(src),
        })
        .where(eq(campaigns.id, created.id));

      for (const pt of FUNNEL_PAGE_TYPES) {
        const [pub] = await db
          .select()
          .from(campaignPages)
          .where(
            and(
              eq(campaignPages.campaignId, sourceId),
              eq(campaignPages.pageType, pt),
              eq(campaignPages.published, true),
            ),
          )
          .orderBy(campaignPages.version);
        await db.insert(campaignPages).values({
          campaignId: created.id,
          pageType: pt,
          version: 1,
          published: true,
          data: (pub?.data ?? defaultPages[pt] ?? defaultPages.landing) as object,
        });
      }

      const prods = await db
        .select()
        .from(campaignProducts)
        .where(eq(campaignProducts.campaignId, sourceId));
      for (const p of prods) {
        await db.insert(campaignProducts).values({
          campaignId: created.id,
          productId: p.productId,
          placement: p.placement,
          sortOrder: p.sortOrder,
        });
      }
    }
  } else {
    for (const pt of FUNNEL_PAGE_TYPES) {
      await db.insert(campaignPages).values({
        campaignId: created.id,
        pageType: pt,
        version: 1,
        published: true,
        data: (defaultPages[pt] ?? defaultPages.landing) as object,
      });
    }
  }

  redirect(`/admin/campaigns/${created.id}`);
}

export async function updateCampaign(fd: FormData) {
  const id = String(fd.get("id"));
  const num = (k: string) => {
    const v = fd.get(k);
    return v ? Number(String(v).replace(/[^\d]/g, "")) : null;
  };
  const str = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const list = (k: string) => {
    const v = String(fd.get(k) ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return v.length ? v : null;
  };

  const newSlug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const [cur] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!cur) return;

  if (newSlug && newSlug !== cur.slug && isValidSlug(newSlug)) {
    const [taken] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.slug, newSlug));
    if (!taken) {
      await db
        .insert(campaignSlugRedirects)
        .values({ oldSlug: cur.slug, campaignId: id })
        .onConflictDoNothing();
      await db.update(campaigns).set({ slug: newSlug }).where(eq(campaigns.id, id));
    }
  }

  const newFunnelType = [
    "evergreen_webinar",
    "live_webinar_reg",
    "vod_course",
    "ebook",
    "paid_consult",
  ].includes(String(fd.get("funnelType")))
    ? String(fd.get("funnelType"))
    : "evergreen_webinar";
  const newTerminalStep = ["booking", "groupchat", "sales"].includes(
    String(fd.get("terminalStep")),
  )
    ? String(fd.get("terminalStep"))
    : "booking";
  // 퍼널 종류가 바뀌면 단계 구성을 새 프리셋으로 재시드 (기존 커스터마이즈는 리셋)
  const reseedFlow =
    newFunnelType !== cur.funnelType
      ? seedFlow({ funnelType: newFunnelType, terminalStep: newTerminalStep })
      : undefined;

  await db
    .update(campaigns)
    .set({
      name: String(fd.get("name") ?? cur.name).trim() || cur.name,
      vodSrc: str("vodSrc"),
      vodWindowHours: num("vodWindowHours") ?? 48,
      bookingEmbedUrl: str("bookingEmbedUrl"),
      downloadUrl: str("downloadUrl"),
      checkoutRedirectUrl: str("checkoutRedirectUrl"),
      funnelType: newFunnelType,
      terminalStep: newTerminalStep,
      ...(reseedFlow ? { flow: reseedFlow } : {}),
      groupChatUrl: str("groupChatUrl"),
      countdownMode: String(fd.get("countdownMode") ?? "none"),
      countdownRushSeconds: num("countdownRushSeconds"),
      countdownDeadline: fd.get("countdownDeadline")
        ? new Date(String(fd.get("countdownDeadline")))
        : null,
      metaPixelId: str("metaPixelId"),
      ga4MeasurementId: str("ga4MeasurementId"),
      defaultUtmCampaign: str("defaultUtmCampaign"),
      metaAdAccountId: str("metaAdAccountId")?.replace(/^act_/, "") ?? null,
      metaAdCampaignIds: list("metaAdCampaignIds"),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, id));

  revalidatePath(`/admin/campaigns/${id}`);
}

/** 목록에서 인라인 이름 수정 (다른 설정은 건드리지 않음) */
export async function renameCampaign(
  _prev: { error?: string } | null,
  fd: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!id) return { error: "잘못된 요청" };
  if (!name) return { error: "이름을 입력하세요" };
  if (name.length > 60) return { error: "이름이 너무 깁니다 (60자 이내)" };

  const [cur] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!cur) return { error: "캠페인을 찾을 수 없습니다" };

  await db
    .update(campaigns)
    .set({ name, updatedAt: new Date() })
    .where(eq(campaigns.id, id));
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${id}`);
  return { ok: true };
}

/** 캠페인 삭제. 기본·템플릿·리드/주문 보유 캠페인은 삭제 불가 */
export async function deleteCampaign(
  _prev: { error?: string } | null,
  fd: FormData,
): Promise<{ error?: string }> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "잘못된 요청" };

  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) return { error: "캠페인을 찾을 수 없습니다" };
  if (c.isDefault) return { error: "기본 캠페인은 삭제할 수 없습니다" };
  if (c.isTemplate) return { error: "템플릿 캠페인은 삭제할 수 없습니다" };

  const [{ n: leadCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.campaignId, id));
  if (leadCount > 0) {
    return {
      error: `신청자 ${leadCount}명이 연결돼 있어 삭제할 수 없습니다. 보관(archived) 처리하세요.`,
    };
  }
  const [{ n: orderCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.campaignId, id));
  if (orderCount > 0) {
    return { error: `주문 ${orderCount}건이 연결돼 있어 삭제할 수 없습니다.` };
  }
  const [{ n: subCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(eq(subscriptions.campaignId, id));
  if (subCount > 0) {
    return {
      error: `구독 ${subCount}건이 연결돼 있어 삭제할 수 없습니다. 보관(archived) 처리하세요.`,
    };
  }

  /*
   * campaigns 를 참조하면서 cascade 가 아닌 테이블은 직접 치워야 한다.
   * (cascade: campaign_pages · campaign_products · campaign_messages ·
   *  campaign_slug_redirects · events · ad_daily_stats)
   *  - message_automations: 이 캠페인 전용 자동화. 템플릿으로 만든 캠페인은
   *    항상 몇 개씩 딸려 있어서, 안 지우면 삭제가 FK 위반으로 터진다.
   *    (steps · enrollments · sends 는 여기서 cascade)
   *  - pending_orders: 결제창만 열고 만 흔적. 남길 이유 없음.
   */
  try {
    await db
      .delete(messageAutomations)
      .where(eq(messageAutomations.campaignId, id));
    await db.delete(pendingOrders).where(eq(pendingOrders.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
  } catch (e) {
    // 화면이 통째로 죽는 대신 왜 안 되는지 보여준다
    console.error("deleteCampaign failed", { campaignId: id, error: e });
    return {
      error:
        "다른 데이터가 이 캠페인을 참조하고 있어 삭제하지 못했습니다. 대신 보관(archived) 처리하세요.",
    };
  }

  revalidatePath("/admin/campaigns");
  redirect("/admin/campaigns");
}

export async function setCampaignStatus(fd: FormData) {
  const id = String(fd.get("id"));
  const status = String(fd.get("status")) as "draft" | "live" | "archived";
  await db.update(campaigns).set({ status }).where(eq(campaigns.id, id));
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${id}`);
}

export async function makeDefault(fd: FormData) {
  const id = String(fd.get("id"));
  await db.update(campaigns).set({ isDefault: false });
  await db
    .update(campaigns)
    .set({ isDefault: true, status: "live" })
    .where(eq(campaigns.id, id));
  revalidatePath("/admin/campaigns");
  revalidatePath(`/admin/campaigns/${id}`);
}

/** 랜딩 A/B 시작: 발행된 variant a 를 복제해 b 생성 + ab_landing on */
export async function startAbTest(fd: FormData) {
  const campaignId = String(fd.get("id"));
  const [aPage] = await db
    .select()
    .from(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, campaignId),
        eq(campaignPages.pageType, "landing"),
        eq(campaignPages.variant, "a"),
        eq(campaignPages.published, true),
      ),
    );
  // 기존 b 정리
  await db
    .delete(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, campaignId),
        eq(campaignPages.pageType, "landing"),
        eq(campaignPages.variant, "b"),
      ),
    );
  await db.insert(campaignPages).values({
    campaignId,
    pageType: "landing",
    variant: "b",
    version: 1,
    published: true,
    data: (aPage?.data ?? {}) as object,
  });
  await db
    .update(campaigns)
    .set({ abLanding: true, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  bustAbCache();
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

/** A/B 종료: 승자(winner) 를 variant a 발행본으로, b 삭제, ab_landing off */
export async function endAbTest(fd: FormData) {
  const campaignId = String(fd.get("id"));
  const winner = String(fd.get("winner")) === "b" ? "b" : "a";

  if (winner === "b") {
    const [bPage] = await db
      .select()
      .from(campaignPages)
      .where(
        and(
          eq(campaignPages.campaignId, campaignId),
          eq(campaignPages.pageType, "landing"),
          eq(campaignPages.variant, "b"),
          eq(campaignPages.published, true),
        ),
      );
    if (bPage) {
      await db
        .update(campaignPages)
        .set({ published: false })
        .where(
          and(
            eq(campaignPages.campaignId, campaignId),
            eq(campaignPages.pageType, "landing"),
            eq(campaignPages.variant, "a"),
            eq(campaignPages.published, true),
          ),
        );
      const [lastA] = await db
        .select({ v: campaignPages.version })
        .from(campaignPages)
        .where(
          and(
            eq(campaignPages.campaignId, campaignId),
            eq(campaignPages.pageType, "landing"),
            eq(campaignPages.variant, "a"),
          ),
        )
        .orderBy(desc(campaignPages.version));
      await db.insert(campaignPages).values({
        campaignId,
        pageType: "landing",
        variant: "a",
        version: (lastA?.v ?? 0) + 1,
        published: true,
        data: bPage.data as object,
      });
    }
  }

  await db
    .delete(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, campaignId),
        eq(campaignPages.pageType, "landing"),
        eq(campaignPages.variant, "b"),
      ),
    );
  await db
    .update(campaigns)
    .set({ abLanding: false, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  bustAbCache();
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

export async function setCampaignProduct(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const productId = String(fd.get("productId"));
  const remove = fd.get("remove") === "true";
  if (remove) {
    await db
      .delete(campaignProducts)
      .where(
        and(
          eq(campaignProducts.campaignId, campaignId),
          eq(campaignProducts.productId, productId),
        ),
      );
    revalidatePath(`/admin/campaigns/${campaignId}/settings`);
    return;
  }

  // 추가 오퍼(범프·업셀·다운셀)는 saveCampaignOffers 위저드가 담당한다
  const patch = { placement: String(fd.get("placement") ?? "both") };

  await db
    .insert(campaignProducts)
    .values({ campaignId, productId, ...patch })
    .onConflictDoUpdate({
      target: [campaignProducts.campaignId, campaignProducts.productId],
      set: patch,
    });
  revalidatePath(`/admin/campaigns/${campaignId}/settings`);
}

/** 라이브 웨비나 신청 퍼널의 회차 생성/수정 (docs/multi-product-funnel-plan.md P3) */
export async function saveEvent(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const id = String(fd.get("id") ?? "").trim() || null;
  const startsAtStr = String(fd.get("startsAt") ?? "");
  if (!campaignId || !startsAtStr) return;

  const values = {
    campaignId,
    startsAt: new Date(startsAtStr),
    durationMin: Number(fd.get("durationMin") ?? 60) || 60,
    externalLiveUrl: String(fd.get("externalLiveUrl") ?? "").trim() || null,
    replayUrl: String(fd.get("replayUrl") ?? "").trim() || null,
    replayWindowHours:
      Number(fd.get("replayWindowHours") ?? 48) || 48,
    status: String(fd.get("status") ?? "scheduled"),
  };

  if (id) {
    await db.update(events).set(values).where(eq(events.id, id));
  } else {
    await db.insert(events).values(values);
  }
  revalidatePath(`/admin/campaigns/${campaignId}/settings`);
}

export async function deleteEvent(fd: FormData) {
  const id = String(fd.get("id"));
  const campaignId = String(fd.get("campaignId"));
  await db.delete(events).where(eq(events.id, id));
  revalidatePath(`/admin/campaigns/${campaignId}/settings`);
}

/**
 * 캠페인 허브의 단계 빌더 조작 (docs/multi-product-funnel-plan.md Phase A)
 * fd: campaignId, pageType, op ('add' | 'remove' | 'up' | 'down')
 */
export async function setFlowStep(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const pageType = String(fd.get("pageType"));
  const op = String(fd.get("op"));
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) return;

  let steps = resolveFlowSteps(c).map((s) => ({ ...s }));
  const idx = steps.findIndex((s) => s.pageType === pageType);

  if (op === "add") {
    steps = insertStepOrdered(steps, pageType); // 제자리에 삽입
  } else if (op === "remove") {
    if (idx !== -1) steps[idx].enabled = false;
  } else if (op === "up" && idx > 0) {
    [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
  } else if (op === "down" && idx !== -1 && idx < steps.length - 1) {
    [steps[idx + 1], steps[idx]] = [steps[idx], steps[idx + 1]];
  }

  await db
    .update(campaigns)
    .set({ flow: { steps }, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

/**
 * 설정 체크리스트에서 상품을 인라인으로 만들고 이 퍼널에 자동 연결.
 * fd: campaignId, slotKey, name, price, imageUrl?, tossOrderName?, freeMonths?
 * (docs/funnel-templates-plan.md — 한 흐름으로)
 */
/**
 * 위저드용 — 이 캠페인에서 한 상품의 추가 오퍼(범프·업셀·다운셀)를 저장하고
 * 캠페인 설정으로 돌아간다. 값이 전역(products.*)보다 우선한다.
 */
export async function saveCampaignOffers(fd: FormData) {
  const campaignId = String(fd.get("campaignId") ?? "").trim();
  const productId = String(fd.get("productId") ?? "").trim();
  if (!campaignId || !productId) return;

  const pick = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v || null;
  };
  const bumpProductId = pick("bumpProductId");
  const upsellProductId = pick("upsellProductId");
  const patch = {
    bumpProductId,
    bumpDescription: bumpProductId
      ? String(fd.get("bumpDescription") ?? "").trim() || null
      : null,
    upsellProductId,
    // 업셀이 없으면 다운셀은 뜰 자리가 없다
    downsellProductId: upsellProductId ? pick("downsellProductId") : null,
  };

  await db
    .insert(campaignProducts)
    .values({ campaignId, productId, placement: "both", ...patch })
    .onConflictDoUpdate({
      target: [campaignProducts.campaignId, campaignProducts.productId],
      set: patch,
    });
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath(`/admin/campaigns/${campaignId}/settings`);
  redirect(`/admin/campaigns/${campaignId}/settings`);
}

export async function createSlotProduct(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const slotKey = String(fd.get("slotKey"));
  const name = String(fd.get("name") ?? "").trim();
  if (!campaignId || !name) return;

  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) return;
  const tpl = c.templateKey ? getTemplate(c.templateKey) : undefined;
  const slot = tpl?.productSlots.find((s) => s.key === slotKey);
  if (!slot) return;

  const price =
    slot.priceMode === "free"
      ? 0
      : Number(String(fd.get("price") ?? "0").replace(/[^\d]/g, "")) || 0;
  const isMembership = slot.productType === "membership";

  const [prod] = await db
    .insert(products)
    .values({
      name,
      price,
      type: slot.productType,
      kind: isMembership ? "membership" : "one_time",
      priceMode: slot.priceMode ?? "paid",
      membershipFreeMonths: isMembership
        ? Number(String(fd.get("freeMonths") ?? "1").replace(/[^\d]/g, "")) || 1
        : 0,
      imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
      tossOrderName: String(fd.get("tossOrderName") ?? "").trim() || null,
      active: true,
    })
    .returning({ id: products.id });

  await db
    .insert(campaignProducts)
    .values({ campaignId, productId: prod.id, placement: slot.placement })
    .onConflictDoNothing();

  revalidatePath(`/admin/campaigns/${campaignId}`);
}

/** 체크리스트에서 되는시간/단톡방 링크를 인라인 저장 */
export async function saveSettingField(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const field = String(fd.get("field"));
  const value = String(fd.get("value") ?? "").trim() || null;
  if (
    !["bookingEmbedUrl", "groupChatUrl", "vodSrc", "metaPixelId", "ga4MeasurementId"].includes(
      field,
    )
  )
    return;
  await db
    .update(campaigns)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  revalidatePath(`/admin/campaigns/${campaignId}`);
}

/** 체크리스트에서 자동 메시지(CRM) on/off 를 인라인 토글 */
export async function setAutomationEnabled(fd: FormData) {
  const automationId = String(fd.get("automationId"));
  const enabled = fd.get("enabled") === "true";
  const campaignId = String(fd.get("campaignId") ?? "");
  if (!automationId) return;
  await db
    .update(messageAutomations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(messageAutomations.id, automationId));
  if (campaignId) revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/automation");
}

/* ------------------------------------------------------------------ *
 * 자동 메시지 — 캠페인 화면(개요·라이브 안내)에서 그 자리 편집
 * 전역 기본을 건드리면 이 캠페인 전용본으로 복제 후 편집(clone-on-write).
 * 스텝은 id 가 아니라 stepOrder 로 지목 — 복제되면 id 가 바뀌기 때문.
 * ------------------------------------------------------------------ */

function revCampaign(campaignId: string) {
  if (campaignId) {
    revalidatePath(`/admin/campaigns/${campaignId}`);
    revalidatePath(`/admin/campaigns/${campaignId}/live`);
  }
  revalidatePath("/admin/automation");
}

/** 전역 기본이면 이 캠페인 전용본으로 복제하고 그 id 를 돌려준다(이미 전용이면 그대로). */
async function ensureCampaignAutomation(
  automationId: string,
  campaignId: string,
): Promise<string> {
  const [src] = await db
    .select()
    .from(messageAutomations)
    .where(eq(messageAutomations.id, automationId));
  if (!src) return automationId;
  if (src.campaignId) return automationId; // 이미 캠페인 전용(또는 다른 캠페인 것 — 손대지 않음)

  if (src.key) {
    const [existing] = await db
      .select({ id: messageAutomations.id })
      .from(messageAutomations)
      .where(
        and(
          eq(messageAutomations.campaignId, campaignId),
          eq(messageAutomations.key, src.key),
        ),
      );
    if (existing) return existing.id;
  }

  const [copy] = await db
    .insert(messageAutomations)
    .values({
      campaignId,
      key: src.key,
      name: src.name,
      trigger: src.trigger,
      enabled: src.enabled,
      stopOn: src.stopOn,
    })
    .returning({ id: messageAutomations.id });

  const steps = await db
    .select()
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, automationId))
    .orderBy(asc(messageAutomationSteps.stepOrder));
  if (steps.length > 0) {
    await db.insert(messageAutomationSteps).values(
      steps.map((s) => ({
        automationId: copy.id,
        stepOrder: s.stepOrder,
        delayMinutes: s.delayMinutes,
        audience: s.audience,
        body: s.body,
        enabled: s.enabled,
        channel: s.channel,
        kakaoTemplateId: s.kakaoTemplateId,
        kakaoVariableMap: s.kakaoVariableMap,
      })),
    );
  }
  return copy.id;
}

export async function toggleCampaignAutomation(fd: FormData) {
  const automationId = String(fd.get("automationId") ?? "");
  const campaignId = String(fd.get("campaignId") ?? "");
  const enabled = fd.get("enabled") === "true";
  if (!automationId || !campaignId) return;
  const id = await ensureCampaignAutomation(automationId, campaignId);
  await db
    .update(messageAutomations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(messageAutomations.id, id));
  revCampaign(campaignId);
}

export async function saveCampaignStep(fd: FormData) {
  const automationId = String(fd.get("automationId") ?? "");
  const campaignId = String(fd.get("campaignId") ?? "");
  const stepOrder = Math.round(Number(fd.get("stepOrder") ?? 0));
  if (!automationId || !campaignId || !stepOrder) return;
  const id = await ensureCampaignAutomation(automationId, campaignId);
  const days = Number(fd.get("days") ?? 0);
  const hours = Number(fd.get("hours") ?? 0);
  const mins = Number(fd.get("mins") ?? 0);
  const delayMinutes = Math.max(
    0,
    Math.round(
      (Number.isFinite(days) ? days : 0) * 1440 +
        (Number.isFinite(hours) ? hours : 0) * 60 +
        (Number.isFinite(mins) ? mins : 0),
    ),
  );
  await db
    .update(messageAutomationSteps)
    .set({
      delayMinutes,
      audience: String(fd.get("audience") ?? "all") as never,
      body: String(fd.get("body") ?? ""),
    })
    .where(
      and(
        eq(messageAutomationSteps.automationId, id),
        eq(messageAutomationSteps.stepOrder, stepOrder),
      ),
    );
  revCampaign(campaignId);
}

export async function addCampaignStep(fd: FormData) {
  const automationId = String(fd.get("automationId") ?? "");
  const campaignId = String(fd.get("campaignId") ?? "");
  if (!automationId || !campaignId) return;
  const id = await ensureCampaignAutomation(automationId, campaignId);
  const [{ m } = { m: 0 }] = await db
    .select({ m: max(messageAutomationSteps.stepOrder) })
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, id));
  await db.insert(messageAutomationSteps).values({
    automationId: id,
    stepOrder: (m ?? 0) + 1,
    delayMinutes: 1440,
    audience: "all",
    body: "",
  });
  revCampaign(campaignId);
}

export async function deleteCampaignStep(fd: FormData) {
  const automationId = String(fd.get("automationId") ?? "");
  const campaignId = String(fd.get("campaignId") ?? "");
  const stepOrder = Math.round(Number(fd.get("stepOrder") ?? 0));
  if (!automationId || !campaignId || !stepOrder) return;
  const id = await ensureCampaignAutomation(automationId, campaignId);
  await db
    .delete(messageAutomationSteps)
    .where(
      and(
        eq(messageAutomationSteps.automationId, id),
        eq(messageAutomationSteps.stepOrder, stepOrder),
      ),
    );
  const rows = await db
    .select({ id: messageAutomationSteps.id })
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, id))
    .orderBy(asc(messageAutomationSteps.stepOrder));
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(messageAutomationSteps)
      .set({ stepOrder: i + 1 })
      .where(eq(messageAutomationSteps.id, rows[i].id));
  }
  revCampaign(campaignId);
}
