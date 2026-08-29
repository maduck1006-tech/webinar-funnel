"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationTriggers,
  campaignMessages,
  type messageTrigger,
} from "@/db/schema";

type Trigger = (typeof messageTrigger.enumValues)[number];

function parseOffset(fd: FormData) {
  const v = fd.get("offsetHours");
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── 전역 기본값 ──
export async function toggleTrigger(fd: FormData) {
  const id = String(fd.get("id"));
  const enabled = fd.get("enabled") === "true";
  await db
    .update(automationTriggers)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(automationTriggers.id, id));
  revalidatePath("/admin/automation");
}

export async function saveTemplate(fd: FormData) {
  const id = String(fd.get("id"));
  const template = String(fd.get("template") ?? "");
  await db
    .update(automationTriggers)
    .set({ template, updatedAt: new Date() })
    .where(eq(automationTriggers.id, id));
  revalidatePath("/admin/automation");
}

// ── 캠페인 오버라이드 ──
export async function saveCampaignMessage(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("trigger")) as Trigger;
  const enabled = fd.get("enabled") !== "false";
  const template = String(fd.get("template") ?? "");
  const offsetHours = parseOffset(fd);

  await db
    .insert(campaignMessages)
    .values({ campaignId, trigger, enabled, template, offsetHours })
    .onConflictDoUpdate({
      target: [campaignMessages.campaignId, campaignMessages.trigger],
      set: { enabled, template, offsetHours, updatedAt: new Date() },
    });
  revalidatePath("/admin/automation");
}

export async function toggleCampaignMessage(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("trigger")) as Trigger;
  const enabled = fd.get("enabled") === "true";
  const template = String(fd.get("template") ?? "");
  const offsetHours = parseOffset(fd);
  await db
    .insert(campaignMessages)
    .values({ campaignId, trigger, enabled, template, offsetHours })
    .onConflictDoUpdate({
      target: [campaignMessages.campaignId, campaignMessages.trigger],
      set: { enabled, updatedAt: new Date() },
    });
  revalidatePath("/admin/automation");
}

/** 오버라이드 삭제 → 전역 기본값으로 복귀 */
export async function resetCampaignMessage(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("trigger")) as Trigger;
  await db
    .delete(campaignMessages)
    .where(
      and(
        eq(campaignMessages.campaignId, campaignId),
        eq(campaignMessages.trigger, trigger),
      ),
    );
  revalidatePath("/admin/automation");
}
