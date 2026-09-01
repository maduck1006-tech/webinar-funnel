import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  entitlements,
  leads,
  products,
  subscriptions,
} from "@/db/schema";

export type LibraryItem = {
  key: string;
  kind: "course" | "ebook" | "coaching" | "membership" | "replay";
  title: string;
  subtitle: string;
  href: string;
  imageUrl?: string | null;
  /** 결제 실패 등 사용자 조치가 필요한 항목 */
  urgent?: boolean;
};

function basePath(slug: string, isDefault: boolean) {
  return isDefault ? "" : `/${slug}`;
}

const fmt = (d: Date) =>
  d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

/** 로그인 유저가 보유한 모든 콘텐츠 (강의·전자책·상담·멤버십·무료 리플레이) */
export async function getLibrary(userId: string): Promise<LibraryItem[]> {
  const myLeads = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      vodExpiresAt: leads.vodExpiresAt,
      slug: campaigns.slug,
      isDefault: campaigns.isDefault,
      funnelType: campaigns.funnelType,
    })
    .from(leads)
    .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(eq(leads.userId, userId));

  if (myLeads.length === 0) return [];
  const leadIds = myLeads.map((l) => l.id);
  const leadById = new Map(myLeads.map((l) => [l.id, l]));

  const items: LibraryItem[] = [];
  const now = new Date();

  // 엔타이틀먼트 (강의/전자책/상담)
  const ents = await db
    .select({
      id: entitlements.id,
      leadId: entitlements.leadId,
      kind: entitlements.kind,
      expiresAt: entitlements.expiresAt,
      productName: products.name,
      productType: products.type,
      productId: products.id,
      productImage: products.imageUrl,
    })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .where(
      and(
        inArray(entitlements.leadId, leadIds),
        eq(entitlements.status, "active"),
      ),
    )
    .orderBy(desc(entitlements.grantedAt));

  for (const e of ents) {
    const l = leadById.get(e.leadId);
    if (!l) continue;
    const bp = basePath(l.slug ?? "", l.isDefault ?? true);
    const expNote = e.expiresAt ? `${fmt(e.expiresAt)}까지` : "평생 소장";
    if (e.productType === "vod_course") {
      items.push({
        key: e.id,
        kind: "course",
        title: e.productName,
        subtitle: `VOD 강의 · ${expNote}`,
        href: `${bp}/course?l=${e.leadId}`,
        imageUrl: e.productImage,
      });
    } else if (e.productType === "coaching") {
      items.push({
        key: e.id,
        kind: "coaching",
        title: e.productName,
        subtitle: "1:1 상담권 · 예약하기",
        href: `${bp}/booking?l=${e.leadId}`,
        imageUrl: e.productImage,
      });
    } else if (e.kind !== "membership") {
      items.push({
        key: e.id,
        kind: "ebook",
        title: e.productName,
        subtitle: `다운로드 자료 · ${expNote}`,
        href: `${bp}/download?l=${e.leadId}&p=${e.productId}`,
        imageUrl: e.productImage,
      });
    }
  }

  // 멤버십
  const subs = await db
    .select({
      id: subscriptions.id,
      leadId: subscriptions.leadId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      productName: products.name,
    })
    .from(subscriptions)
    .innerJoin(products, eq(products.id, subscriptions.productId))
    .where(
      and(
        inArray(subscriptions.leadId, leadIds),
        gt(subscriptions.currentPeriodEnd, now),
      ),
    );

  for (const s of subs) {
    const l = leadById.get(s.leadId);
    const bp = l ? basePath(l.slug ?? "", l.isDefault ?? true) : "";
    items.push({
      key: s.id,
      kind: "membership",
      title: s.productName,
      subtitle:
        s.status === "past_due"
          ? "결제에 실패했어요 — 카드를 다시 등록해 주세요"
          : `멤버십 이용 중 · ${fmt(s.currentPeriodEnd)} 갱신`,
      href: `${bp}/course?l=${s.leadId}`,
      urgent: s.status === "past_due",
    });
  }

  // 무료 강의 리플레이 (시청 기한 내)
  for (const l of myLeads) {
    if (l.vodExpiresAt && l.vodExpiresAt.getTime() > now.getTime()) {
      const bp = basePath(l.slug ?? "", l.isDefault ?? true);
      items.push({
        key: `replay-${l.id}`,
        kind: "replay",
        title: "무료 강의 다시보기",
        subtitle: `${fmt(l.vodExpiresAt)}까지 시청 가능`,
        href: `${bp}/vod?l=${l.id}`,
      });
    }
  }

  return items;
}
