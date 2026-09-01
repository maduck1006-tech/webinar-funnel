"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, max } from "drizzle-orm";
import { db } from "@/db";
import {
  messageSequences,
  sequenceSteps,
  type SequenceEnrollEvent,
} from "@/db/schema";

const EVENTS: SequenceEnrollEvent[] = [
  "signup",
  "purchase",
  "booking",
  "manual",
];

export async function createSequence(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const enrollEvent = String(fd.get("enrollEvent") ?? "signup");
  const campaignId = String(fd.get("campaignId") ?? "").trim() || null;
  if (!name || !EVENTS.includes(enrollEvent as SequenceEnrollEvent)) return;

  const [row] = await db
    .insert(messageSequences)
    .values({
      name,
      enrollEvent: enrollEvent as SequenceEnrollEvent,
      campaignId,
    })
    .returning({ id: messageSequences.id });

  revalidatePath("/admin/sequences");
  redirect(`/admin/sequences/${row.id}`);
}

export async function updateSequence(fd: FormData) {
  const id = String(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  const enrollEvent = String(fd.get("enrollEvent") ?? "signup");
  const campaignId = String(fd.get("campaignId") ?? "").trim() || null;
  if (!id || !name) return;
  await db
    .update(messageSequences)
    .set({
      name,
      enrollEvent: enrollEvent as SequenceEnrollEvent,
      campaignId,
      updatedAt: new Date(),
    })
    .where(eq(messageSequences.id, id));
  revalidatePath(`/admin/sequences/${id}`);
}

export async function toggleSequence(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db
    .update(messageSequences)
    .set({ enabled: next, updatedAt: new Date() })
    .where(eq(messageSequences.id, id));
  revalidatePath("/admin/sequences");
  revalidatePath(`/admin/sequences/${id}`);
}

export async function deleteSequence(fd: FormData) {
  const id = String(fd.get("id"));
  await db.delete(messageSequences).where(eq(messageSequences.id, id));
  revalidatePath("/admin/sequences");
  redirect("/admin/sequences");
}

export async function addStep(fd: FormData) {
  const sequenceId = String(fd.get("sequenceId"));
  if (!sequenceId) return;
  const [{ m } = { m: 0 }] = await db
    .select({ m: max(sequenceSteps.stepOrder) })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId));
  await db.insert(sequenceSteps).values({
    sequenceId,
    stepOrder: (m ?? 0) + 1,
    delayHours: 24,
    audience: "all",
    template: "",
  });
  revalidatePath(`/admin/sequences/${sequenceId}`);
}

export async function updateStep(fd: FormData) {
  const id = String(fd.get("id"));
  const sequenceId = String(fd.get("sequenceId"));
  const days = Number(fd.get("days") ?? 0);
  const hours = Number(fd.get("hours") ?? 0);
  const delayHours = Math.max(
    0,
    Math.round((Number.isFinite(days) ? days : 0) * 24 + (Number.isFinite(hours) ? hours : 0)),
  );
  await db
    .update(sequenceSteps)
    .set({
      delayHours,
      audience: String(fd.get("audience") ?? "all") as never,
      template: String(fd.get("template") ?? ""),
      enabled: fd.get("enabled") === "on",
    })
    .where(eq(sequenceSteps.id, id));
  revalidatePath(`/admin/sequences/${sequenceId}`);
}

export async function deleteStep(fd: FormData) {
  const id = String(fd.get("id"));
  const sequenceId = String(fd.get("sequenceId"));
  await db.delete(sequenceSteps).where(eq(sequenceSteps.id, id));
  // 순서 재정렬
  const rows = await db
    .select({ id: sequenceSteps.id })
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(sequenceSteps.stepOrder));
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(sequenceSteps)
      .set({ stepOrder: i + 1 })
      .where(eq(sequenceSteps.id, rows[i].id));
  }
  revalidatePath(`/admin/sequences/${sequenceId}`);
}
