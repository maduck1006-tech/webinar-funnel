"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { broadcasts } from "@/db/schema";
import { runBroadcast, type Segment } from "@/lib/broadcasts";

function parseSegment(fd: FormData): Segment {
  const s: Segment = {};
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  if (v("campaignId")) s.campaignId = v("campaignId");
  if (v("watched") === "yes" || v("watched") === "no")
    s.watched = v("watched") as "yes" | "no";
  if (v("purchased") === "yes" || v("purchased") === "no")
    s.purchased = v("purchased") as "yes" | "no";
  if (v("booked") === "yes" || v("booked") === "no")
    s.booked = v("booked") as "yes" | "no";
  if (v("productId")) {
    s.productId = v("productId");
    s.productExclude = v("productMode") === "exclude";
  }
  if (v("signupFrom")) s.signupFrom = v("signupFrom");
  if (v("signupTo")) s.signupTo = v("signupTo");
  return s;
}

export async function createBroadcast(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim() || "브로드캐스트";
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return;
  const schedRaw = String(fd.get("scheduledAt") ?? "").trim();
  const scheduledAt = schedRaw ? new Date(schedRaw) : null;

  const [row] = await db
    .insert(broadcasts)
    .values({
      name,
      body,
      segment: parseSegment(fd) as Record<string, unknown>,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "sending",
    })
    .returning({ id: broadcasts.id });

  if (!scheduledAt) {
    after(() => runBroadcast(row.id).catch(() => {}));
  }
  revalidatePath("/admin/broadcasts");
  redirect("/admin/broadcasts");
}

export async function deleteBroadcast(fd: FormData) {
  await db.delete(broadcasts).where(eq(broadcasts.id, String(fd.get("id"))));
  revalidatePath("/admin/broadcasts");
}
