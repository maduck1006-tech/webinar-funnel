"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignPages,
  campaignProducts,
  campaignSlugRedirects,
  campaigns,
  events,
  leads,
  orders,
} from "@/db/schema";
import { bustAbCache, isValidSlug } from "@/lib/campaign";
import { FUNNEL_PAGE_TYPES } from "@/lib/flow-types";
import { defaultPages } from "@/puck/defaults";

/** 템플릿/기존 캠페인에서 복제해 새 캠페인 생성 */
export async function createCampaign(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  const sourceId = String(fd.get("sourceId") ?? "").trim() || null;
  if (!name || !isValidSlug(slug)) return;

  const [dup] = await db.select().from(campaigns).where(eq(campaigns.slug, slug));
  if (dup) return;

  const [created] = await db
    .insert(campaigns)
    .values({ name, slug, status: "draft" })
    .returning();

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
          data: (pub?.data ?? defaultPages[pt]) as object,
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
        data: defaultPages[pt] as object,
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

  await db
    .update(campaigns)
    .set({
      name: String(fd.get("name") ?? cur.name).trim() || cur.name,
      vodSrc: str("vodSrc"),
      vodWindowHours: num("vodWindowHours") ?? 48,
      bookingEmbedUrl: str("bookingEmbedUrl"),
      downloadUrl: str("downloadUrl"),
      checkoutRedirectUrl: str("checkoutRedirectUrl"),
      funnelType: [
        "evergreen_webinar",
        "live_webinar_reg",
        "vod_course",
        "ebook",
        "paid_consult",
      ].includes(String(fd.get("funnelType")))
        ? String(fd.get("funnelType"))
        : "evergreen_webinar",
      terminalStep: ["booking", "groupchat", "sales"].includes(
        String(fd.get("terminalStep")),
      )
        ? String(fd.get("terminalStep"))
        : "booking",
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

  // campaign_pages / campaign_products / campaign_messages / campaign_slug_redirects 는 cascade
  await db.delete(campaigns).where(eq(campaigns.id, id));
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
  const placement = String(fd.get("placement") ?? "both");
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
  } else {
    await db
      .insert(campaignProducts)
      .values({ campaignId, productId, placement })
      .onConflictDoUpdate({
        target: [campaignProducts.campaignId, campaignProducts.productId],
        set: { placement },
      });
  }
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
