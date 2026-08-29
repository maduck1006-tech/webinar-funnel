"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, messageLogs } from "@/db/schema";
import { renderMessage, sendSms } from "@/lib/solapi";

export type ActionResult = { ok: boolean; message: string };

export async function resendMessage(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const leadId = String(fd.get("leadId"));
  const trigger = String(fd.get("trigger")) as "signup_confirm";
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return { ok: false, message: "고객을 찾을 수 없습니다." };
  // (leadId, trigger) 유니크 — 수동 재발송이므로 기존 로그가 있으면 갱신(upsert)
  const [log] = await db
    .insert(messageLogs)
    .values({ leadId, trigger, status: "pending" })
    .onConflictDoUpdate({
      target: [messageLogs.leadId, messageLogs.trigger],
      set: { status: "pending", sentAt: null, error: null },
    })
    .returning({ id: messageLogs.id });
  try {
    await sendSms(lead.phone, renderMessage(trigger, { leadId }));
    await db
      .update(messageLogs)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(messageLogs.id, log.id));
    revalidatePath(`/admin/crm/${leadId}`);
    return { ok: true, message: `${lead.phone} 로 문자를 재발송했습니다.` };
  } catch (e) {
    await db
      .update(messageLogs)
      .set({ status: "failed", error: String(e) })
      .where(eq(messageLogs.id, log.id));
    revalidatePath(`/admin/crm/${leadId}`);
    return { ok: false, message: `발송 실패: ${String(e)}` };
  }
}

/** 시청 권한 재부여 = 만료시각을 지금부터 48h 뒤로 연장 + 상태 되돌림 */
export async function regrantAccess(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
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
  return { ok: true, message: `시청 기한을 ${hours}시간 연장했습니다.` };
}

export async function forceStatus(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const leadId = String(fd.get("leadId"));
  const status = String(fd.get("status")) as typeof leads.$inferSelect.status;
  await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
  revalidatePath(`/admin/crm/${leadId}`);
  return { ok: true, message: `상태를 '${status}' 로 변경했습니다.` };
}
