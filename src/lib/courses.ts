import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  courseLessons,
  courseModules,
  courses,
  lessonProgress,
  type Course,
  type CourseLesson,
  type CourseModule,
} from "@/db/schema";

export type CourseTree = {
  course: Course;
  modules: (CourseModule & { lessons: CourseLesson[] })[];
};

/** 상품에 연결된 강의 전체 트리 (모듈→레슨, 정렬순) */
export async function getCourseByProduct(
  productId: string,
): Promise<CourseTree | null> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.productId, productId));
  if (!course) return null;

  const mods = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, course.id))
    .orderBy(asc(courseModules.sortOrder));

  // 모듈별로 레슨 조회 (모듈 수가 적어 N+1 감수 — 캐시 불필요한 규모)
  const modulesWithLessons = await Promise.all(
    mods.map(async (m) => ({
      ...m,
      lessons: await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.moduleId, m.id))
        .orderBy(asc(courseLessons.sortOrder)),
    })),
  );

  return { course, modules: modulesWithLessons };
}

/** 유튜브 videoRef(ID 또는 URL) → 임베드 URL(youtube-nocookie) */
export function youtubeEmbedUrl(ref: string): string {
  const idMatch = ref.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/,
  );
  const id = idMatch ? idMatch[1] : ref.trim();
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** 레슨이 지금 열려있는지: 맛보기이거나, 드립기간이 지났으면 */
export function lessonUnlocked(
  lesson: Pick<CourseLesson, "isPreview" | "dripDays">,
  grantedAt: Date | null,
): boolean {
  if (lesson.isPreview) return true;
  if (!grantedAt) return false;
  if (!lesson.dripDays) return true;
  return Date.now() >= grantedAt.getTime() + lesson.dripDays * 86_400_000;
}

export async function markLessonComplete(
  leadId: string,
  lessonId: string,
): Promise<void> {
  await db
    .insert(lessonProgress)
    .values({ leadId, lessonId, completedAt: new Date() })
    .onConflictDoUpdate({
      target: [lessonProgress.leadId, lessonProgress.lessonId],
      set: { completedAt: new Date() },
    });
}

export async function getProgress(
  leadId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ lessonId: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.leadId, leadId)));
  return new Set(rows.map((r) => r.lessonId));
}
