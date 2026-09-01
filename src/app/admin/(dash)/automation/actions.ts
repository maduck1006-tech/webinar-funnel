"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import {
  messageAutomations,
  messageAutomationSteps,
  type MessageAutomationTrigger,
} from "@/db/schema";

const TRIGGERS: MessageAutomationTrigger[] = [
  "signup",
  "watch_start",
  "purchase",
  "booking",
  "manual",
  "event_registered",
];

function rev(id?: string) {
  revalidatePath("/admin/automation");
  if (id) revalidatePath(`/admin/automation/${id}`);
}

export async function createAutomation(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const trigger = String(fd.get("trigger") ?? "signup");
  const campaignId = String(fd.get("campaignId") ?? "").trim() || null;
  if (!name || !TRIGGERS.includes(trigger as MessageAutomationTrigger)) return;
  const [row] = await db
    .insert(messageAutomations)
    .values({
      name,
      trigger: trigger as MessageAutomationTrigger,
      campaignId,
    })
    .returning({ id: messageAutomations.id });
  rev();
  redirect(`/admin/automation/${row.id}`);
}

export async function updateAutomation(fd: FormData) {
  const id = String(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  const trigger = String(fd.get("trigger") ?? "signup");
  const stopPurchase = fd.get("stop_purchase") === "on";
  const stopBooking = fd.get("stop_booking") === "on";
  const stopWatch = fd.get("stop_watch_start") === "on";
  const stopOn = [
    stopPurchase && "purchase",
    stopBooking && "booking",
    stopWatch && "watch_start",
  ].filter(Boolean) as string[];
  if (!id || !name) return;
  await db
    .update(messageAutomations)
    .set({
      name,
      trigger: trigger as MessageAutomationTrigger,
      stopOn,
      updatedAt: new Date(),
    })
    .where(eq(messageAutomations.id, id));
  rev(id);
}

export async function toggleAutomation(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db
    .update(messageAutomations)
    .set({ enabled: next, updatedAt: new Date() })
    .where(eq(messageAutomations.id, id));
  rev(id);
}

export async function deleteAutomation(fd: FormData) {
  const id = String(fd.get("id"));
  await db.delete(messageAutomations).where(eq(messageAutomations.id, id));
  revalidatePath("/admin/automation");
  redirect("/admin/automation");
}

/** 전역 기본 자동화를 특정 캠페인 전용본으로 복제 (오버라이드 시작) */
export async function cloneForCampaign(fd: FormData) {
  const sourceId = String(fd.get("sourceId"));
  const campaignId = String(fd.get("campaignId"));
  if (!sourceId || !campaignId) return;

  const [src] = await db
    .select()
    .from(messageAutomations)
    .where(eq(messageAutomations.id, sourceId));
  if (!src || src.campaignId) return;

  // 이미 이 캠페인에 같은 key 복제본이 있으면 그리로
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
    if (existing) {
      rev();
      redirect(`/admin/automation/${existing.id}`);
    }
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
    .where(eq(messageAutomationSteps.automationId, sourceId))
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
      })),
    );
  }
  rev();
  redirect(`/admin/automation/${copy.id}`);
}

/** 캠페인 오버라이드 삭제 → 전역 기본값으로 복귀 */
export async function removeCampaignOverride(fd: FormData) {
  const id = String(fd.get("id"));
  const [row] = await db
    .select({ campaignId: messageAutomations.campaignId })
    .from(messageAutomations)
    .where(eq(messageAutomations.id, id));
  if (!row?.campaignId) return; // 전역은 삭제 안 함
  await db.delete(messageAutomations).where(eq(messageAutomations.id, id));
  revalidatePath("/admin/automation");
  redirect("/admin/automation");
}

/* ---------- 스텝 ---------- */

export async function addStep(fd: FormData) {
  const automationId = String(fd.get("automationId"));
  if (!automationId) return;
  const [{ m } = { m: 0 }] = await db
    .select({ m: max(messageAutomationSteps.stepOrder) })
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, automationId));
  await db.insert(messageAutomationSteps).values({
    automationId,
    stepOrder: (m ?? 0) + 1,
    delayMinutes: 1440,
    audience: "all",
    body: "",
  });
  rev(automationId);
}

export async function updateStep(fd: FormData) {
  const id = String(fd.get("id"));
  const automationId = String(fd.get("automationId"));
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
      enabled: fd.get("enabled") === "on",
    })
    .where(eq(messageAutomationSteps.id, id));
  rev(automationId);
}

export async function deleteStep(fd: FormData) {
  const id = String(fd.get("id"));
  const automationId = String(fd.get("automationId"));
  await db.delete(messageAutomationSteps).where(eq(messageAutomationSteps.id, id));
  const rows = await db
    .select({ id: messageAutomationSteps.id })
    .from(messageAutomationSteps)
    .where(eq(messageAutomationSteps.automationId, automationId))
    .orderBy(asc(messageAutomationSteps.stepOrder));
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(messageAutomationSteps)
      .set({ stepOrder: i + 1 })
      .where(eq(messageAutomationSteps.id, rows[i].id));
  }
  rev(automationId);
}
