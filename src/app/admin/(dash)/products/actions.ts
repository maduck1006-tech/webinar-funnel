"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";

function parse(fd: FormData) {
  const num = (k: string) => {
    const v = fd.get(k);
    return v ? Number(String(v).replace(/[^\d]/g, "")) : null;
  };
  const date = (k: string) => {
    const v = fd.get(k);
    return v ? new Date(String(v)) : null;
  };
  return {
    name: String(fd.get("name") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim() || null,
    imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
    price: num("price") ?? 0,
    compareAtPrice: num("compareAtPrice"),
    showFrom: date("showFrom"),
    showUntil: date("showUntil"),
    latpeedCheckoutUrl: String(fd.get("latpeedCheckoutUrl") ?? "").trim() || null,
    placement: String(fd.get("placement") ?? "both"),
    active: fd.get("active") === "on",
  };
}

export async function saveProduct(fd: FormData) {
  const id = fd.get("id") ? String(fd.get("id")) : null;
  const data = parse(fd);
  if (!data.name || !data.price) return;
  if (id) {
    await db.update(products).set(data).where(eq(products.id, id));
  } else {
    await db.insert(products).values(data);
  }
  revalidatePath("/admin/products");
}

export async function toggleProduct(fd: FormData) {
  const id = String(fd.get("id"));
  const next = fd.get("next") === "true";
  await db.update(products).set({ active: next }).where(eq(products.id, id));
  revalidatePath("/admin/products");
}
