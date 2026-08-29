"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";

export async function correctOrder(fd: FormData) {
  const id = String(fd.get("id"));
  const status = String(fd.get("status")) as "success" | "cancel" | "webhook_missing";
  await db.update(orders).set({ status }).where(eq(orders.id, id));
  revalidatePath("/admin/orders");
}
