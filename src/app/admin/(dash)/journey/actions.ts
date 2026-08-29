"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationTriggers,
  campaignMessages,
  type messageTrigger,
} from "@/db/schema";
import { JOURNEY_STOPS } from "./meta";

type Trigger = (typeof messageTrigger.enumValues)[number];

const META = new Map(JOURNEY_STOPS.map((s) => [s.triggerKey, s]));

function parseOffset(fd: FormData): number | null {
  const v = fd.get("offsetHours");
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 전역 기본 문구 저장 (row 없으면 생성). 캠페인 미선택 시. */
export async function saveGlobalMessage(fd: FormData) {
  const key = String(fd.get("key")) as Trigger;
  const template = String(fd.get("template") ?? "");
  const offsetHours = parseOffset(fd);
  const meta = META.get(key);

  await db
    .insert(automationTriggers)
    .values({
      key,
      label: meta?.when ?? key,
      condition: meta?.why ?? "",
      template,
      offsetHours,
    })
    .onConflictDoUpdate({
      target: automationTriggers.key,
      set: { template, offsetHours, updatedAt: new Date() },
    });
  revalidatePath("/admin/journey");
}

export async function toggleGlobalMessage(fd: FormData) {
  const key = String(fd.get("key")) as Trigger;
  const enabled = fd.get("enabled") === "true";
  const meta = META.get(key);
  await db
    .insert(automationTriggers)
    .values({
      key,
      label: meta?.when ?? key,
      condition: meta?.why ?? "",
      enabled,
      template: meta?.defaultTemplate ?? "",
      offsetHours: meta?.offsetHours ?? null,
    })
    .onConflictDoUpdate({
      target: automationTriggers.key,
      set: { enabled, updatedAt: new Date() },
    });
  revalidatePath("/admin/journey");
}

/** 캠페인 전용 문구 저장 */
export async function saveCampaignMessageJ(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("key")) as Trigger;
  const template = String(fd.get("template") ?? "");
  const offsetHours = parseOffset(fd);
  await db
    .insert(campaignMessages)
    .values({ campaignId, trigger, enabled: true, template, offsetHours })
    .onConflictDoUpdate({
      target: [campaignMessages.campaignId, campaignMessages.trigger],
      set: { template, offsetHours, updatedAt: new Date() },
    });
  revalidatePath("/admin/journey");
}

export async function toggleCampaignMessageJ(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("key")) as Trigger;
  const enabled = fd.get("enabled") === "true";
  const template = String(fd.get("template") ?? "");
  await db
    .insert(campaignMessages)
    .values({ campaignId, trigger, enabled, template })
    .onConflictDoUpdate({
      target: [campaignMessages.campaignId, campaignMessages.trigger],
      set: { enabled, updatedAt: new Date() },
    });
  revalidatePath("/admin/journey");
}

/** 캠페인 오버라이드 삭제 → 전역 기본값으로 */
export async function resetCampaignMessageJ(fd: FormData) {
  const campaignId = String(fd.get("campaignId"));
  const trigger = String(fd.get("key")) as Trigger;
  await db
    .delete(campaignMessages)
    .where(
      and(
        eq(campaignMessages.campaignId, campaignId),
        eq(campaignMessages.trigger, trigger),
      ),
    );
  revalidatePath("/admin/journey");
}
