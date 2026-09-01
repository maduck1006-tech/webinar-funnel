"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseLessons, courseModules, courses, products } from "@/db/schema";

function path(productId: string) {
  return `/admin/products/${productId}/course`;
}

/** 상품에 강의 없으면 생성(제목=상품명) */
export async function ensureCourse(productId: string): Promise<string> {
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.productId, productId));
  if (existing) return existing.id;

  const [product] = await db
    .select({ name: products.name })
    .from(products)
    .where(eq(products.id, productId));
  const [created] = await db
    .insert(courses)
    .values({ productId, title: product?.name ?? "새 강의" })
    .returning({ id: courses.id });
  return created.id;
}

export async function saveCourseMeta(fd: FormData) {
  const courseId = String(fd.get("courseId"));
  const productId = String(fd.get("productId"));
  await db
    .update(courses)
    .set({
      title: String(fd.get("title") ?? "").trim() || "제목 없음",
      description: String(fd.get("description") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));
  revalidatePath(path(productId));
}

export async function addModule(fd: FormData) {
  const courseId = String(fd.get("courseId"));
  const productId = String(fd.get("productId"));
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return;
  const [{ n }] = await db
    .select({ n: count() })
    .from(courseModules)
    .where(eq(courseModules.courseId, courseId));
  await db.insert(courseModules).values({ courseId, title, sortOrder: n });
  revalidatePath(path(productId));
}

export async function deleteModule(fd: FormData) {
  const id = String(fd.get("id"));
  const productId = String(fd.get("productId"));
  await db.delete(courseModules).where(eq(courseModules.id, id));
  revalidatePath(path(productId));
}

export async function addLesson(fd: FormData) {
  const moduleId = String(fd.get("moduleId"));
  const productId = String(fd.get("productId"));
  const title = String(fd.get("title") ?? "").trim();
  const videoRef = String(fd.get("videoRef") ?? "").trim();
  if (!title) return;
  await db.insert(courseLessons).values({
    moduleId,
    title,
    videoRef,
    sortOrder: Number(fd.get("sortOrder") ?? 0),
    isPreview: fd.get("isPreview") === "on",
    dripDays: Number(fd.get("dripDays") ?? 0) || 0,
  });
  revalidatePath(path(productId));
}

export async function updateLesson(fd: FormData) {
  const id = String(fd.get("id"));
  const productId = String(fd.get("productId"));
  await db
    .update(courseLessons)
    .set({
      title: String(fd.get("title") ?? "").trim() || "제목 없음",
      videoRef: String(fd.get("videoRef") ?? "").trim(),
      sortOrder: Number(fd.get("sortOrder") ?? 0),
      isPreview: fd.get("isPreview") === "on",
      dripDays: Number(fd.get("dripDays") ?? 0) || 0,
    })
    .where(eq(courseLessons.id, id));
  revalidatePath(path(productId));
}

export async function deleteLesson(fd: FormData) {
  const id = String(fd.get("id"));
  const productId = String(fd.get("productId"));
  await db.delete(courseLessons).where(eq(courseLessons.id, id));
  revalidatePath(path(productId));
}
