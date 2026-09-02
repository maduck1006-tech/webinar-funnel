"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { affiliates, orders } from "@/db/schema";

function slugCode(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

export async function saveAffiliate(fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const name = String(fd.get("name") ?? "").trim();
  const code = slugCode(String(fd.get("code") ?? ""));
  const pctRaw = Number(String(fd.get("commissionPct") ?? "").replace(/[^\d]/g, ""));
  const commissionPct = Math.min(100, Math.max(0, pctRaw || 20));
  const phone = String(fd.get("phone") ?? "").trim() || null;
  const email = String(fd.get("email") ?? "").trim() || null;
  const payoutInfo = String(fd.get("payoutInfo") ?? "").trim() || null;
  if (!name || code.length < 2) return;

  const data = { name, code, commissionPct, phone, email, payoutInfo };
  if (id) {
    await db.update(affiliates).set(data).where(eq(affiliates.id, id));
  } else {
    await db.insert(affiliates).values(data).onConflictDoNothing();
  }
  revalidatePath("/admin/affiliates");
}

export async function toggleAffiliate(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true" ? "active" : "paused";
  await db.update(affiliates).set({ status: next }).where(eq(affiliates.id, id));
  revalidatePath("/admin/affiliates");
}

/** 이 어필리에이트의 미지급 커미션을 전부 지급 완료 처리 */
export async function markCommissionPaid(fd: FormData) {
  const id = String(fd.get("id"));
  await db
    .update(orders)
    .set({ commissionPaid: true })
    .where(and(eq(orders.affiliateId, id), eq(orders.status, "success")));
  revalidatePath("/admin/affiliates");
}
