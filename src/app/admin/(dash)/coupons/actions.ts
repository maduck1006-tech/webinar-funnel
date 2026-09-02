"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { normalizeCode } from "@/lib/coupons";

function parse(fd: FormData) {
  const num = (k: string) => {
    const v = String(fd.get(k) ?? "").replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const date = (k: string) => {
    const v = fd.get(k);
    return v ? new Date(String(v)) : null;
  };
  const type = String(fd.get("type") ?? "percent");
  let value = num("value") ?? 0;
  if (type === "percent") value = Math.min(100, Math.max(1, value));
  return {
    code: normalizeCode(String(fd.get("code") ?? "")),
    name: String(fd.get("name") ?? "").trim() || null,
    type,
    value,
    minAmount: num("minAmount"),
    maxRedemptions: num("maxRedemptions"),
    leadWindowHours: num("leadWindowHours"),
    startsAt: date("startsAt"),
    endsAt: date("endsAt"),
    active: fd.get("active") === "on",
  };
}

export async function saveCoupon(fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const data = parse(fd);
  if (!data.code || !data.value) return;
  if (id) {
    await db.update(coupons).set(data).where(eq(coupons.id, id));
  } else {
    await db.insert(coupons).values(data).onConflictDoNothing();
  }
  revalidatePath("/admin/coupons");
}

export async function toggleCoupon(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db.update(coupons).set({ active: next }).where(eq(coupons.id, id));
  revalidatePath("/admin/coupons");
}

export async function deleteCoupon(fd: FormData) {
  await db.delete(coupons).where(eq(coupons.id, String(fd.get("id"))));
  revalidatePath("/admin/coupons");
}
