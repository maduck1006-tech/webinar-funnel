"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, messageLogs } from "@/db/schema";
import { renderMessage, sendSms } from "@/lib/solapi";

export async function resendMessage(fd: FormData) {
  const leadId = String(fd.get("leadId"));
  const trigger = String(fd.get("trigger")) as "signup_confirm";
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return;
  const [log] = await db
    .insert(messageLogs)
    .values({ leadId, trigger })
    .returning({ id: messageLogs.id });
  try {
    await sendSms(lead.phone, renderMessage(trigger, { leadId }));
    await db
      .update(messageLogs)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(messageLogs.id, log.id));
  } catch (e) {
    await db
      .update(messageLogs)
      .set({ status: "failed", error: String(e) })
      .where(eq(messageLogs.id, log.id));
  }
  revalidatePath(`/admin/crm/${leadId}`);
}

/** 시청 권한 재부여 = 만료시각을 지금부터 48h 뒤로 연장 + 상태 되돌림 */
export async function regrantAccess(fd: FormData) {
  const leadId = String(fd.get("leadId"));
  const hours = Number(process.env.VOD_ACCESS_WINDOW_HOURS ?? 48);
  await db
    .update(leads)
    .set({
      vodExpiresAt: new Date(Date.now() + hours * 3600 * 1000),
      status: "applied",
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
  revalidatePath(`/admin/crm/${leadId}`);
}

export async function forceStatus(fd: FormData) {
  const leadId = String(fd.get("leadId"));
  const status = String(fd.get("status")) as typeof leads.$inferSelect.status;
  await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  revalidatePath(`/admin/crm/${leadId}`);
}
