import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { Card, PageHeader } from "@/components/admin-ui";
import { ConfirmSubmit } from "../../../form-ui";
import { getCourseByProduct } from "@/lib/courses";
import {
  addLesson,
  addModule,
  deleteLesson,
  deleteModule,
  ensureCourse,
  saveCourseMeta,
  updateLesson,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: productId } = await params;
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  if (!product) notFound();

  await ensureCourse(productId);
  const tree = await getCourseByProduct(productId);
  if (!tree) notFound();

  return (
    <>
      <PageHeader
        title={`${product.name} · 강의 구성`}
        desc={
          <Link href="/admin/products" className="text-blue-600 underline">
            ← 상품 관리
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {tree.modules.map((m) => (
            <Card key={m.id}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold">{m.title}</p>
                <form action={deleteModule}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="productId" value={productId} />
                  <ConfirmSubmit
                    message={`모듈 "${m.title}" 과(와) 하위 레슨을 삭제할까요? 되돌릴 수 없습니다.`}
                    className="text-xs text-red-600 hover:underline"
                  >
                    모듈 삭제
                  </ConfirmSubmit>
                </form>
              </div>

              <ul className="space-y-2">
                {m.lessons.map((ls) => (
                  <li
                    key={ls.id}
                    className="rounded-lg border border-zinc-200 p-3"
                  >
                    <form
                      action={updateLesson}
                      className="grid gap-2 text-xs sm:grid-cols-[1fr_1fr_80px_60px_auto]"
                    >
                      <input type="hidden" name="id" value={ls.id} />
                      <input type="hidden" name="productId" value={productId} />
                      <input
                        name="title"
                        defaultValue={ls.title}
                        placeholder="레슨 제목"
                        className="rounded border px-2 py-1"
                      />
                      <input
                        name="videoRef"
                        defaultValue={ls.videoRef}
                        placeholder="유튜브 영상 ID 또는 URL (일부공개)"
                        className="rounded border px-2 py-1"
                      />
                      <label className="flex items-center gap-1 whitespace-nowrap">
                        <input
                          type="checkbox"
                          name="isPreview"
                          defaultChecked={ls.isPreview}
                        />
                        맛보기
                      </label>
                      <input
                        name="dripDays"
                        type="number"
                        min={0}
                        defaultValue={ls.dripDays}
                        title="구매 후 N일 뒤 오픈 (0=즉시)"
                        className="w-full rounded border px-2 py-1"
                      />
                      <div className="flex gap-1">
                        <button className="rounded border px-2 py-1 font-semibold text-blue-600">
                          저장
                        </button>
                      </div>
                      <input
                        type="hidden"
                        name="sortOrder"
                        value={ls.sortOrder}
                      />
                    </form>
                    <form action={deleteLesson} className="mt-1 text-right">
                      <input type="hidden" name="id" value={ls.id} />
                      <input
                        type="hidden"
                        name="productId"
                        value={productId}
                      />
                      <ConfirmSubmit
                        message="이 레슨을 삭제할까요? 되돌릴 수 없습니다."
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        삭제
                      </ConfirmSubmit>
                    </form>
                  </li>
                ))}
              </ul>

              <form
                action={addLesson}
                className="mt-3 grid gap-2 text-xs sm:grid-cols-[1fr_1fr_80px_60px_auto]"
              >
                <input type="hidden" name="moduleId" value={m.id} />
                <input type="hidden" name="productId" value={productId} />
                <input
                  name="title"
                  placeholder="새 레슨 제목"
                  className="rounded border px-2 py-1"
                  required
                />
                <input
                  name="videoRef"
                  placeholder="유튜브 영상 ID/URL"
                  className="rounded border px-2 py-1"
                />
                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input type="checkbox" name="isPreview" />
                  맛보기
                </label>
                <input
                  name="dripDays"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="w-full rounded border px-2 py-1"
                />
                <input type="hidden" name="sortOrder" value={m.lessons.length} />
                <button className="rounded border border-blue-600 px-2 py-1 font-semibold text-blue-600">
                  + 레슨 추가
                </button>
              </form>
            </Card>
          ))}

          <Card>
            <form action={addModule} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="courseId" value={tree.course.id} />
              <input type="hidden" name="productId" value={productId} />
              <input
                name="title"
                placeholder="새 모듈 제목 (예: 1부. 시작하기)"
                className="flex-1 rounded border px-2 py-1.5"
                required
              />
              <button className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-blue-600">
                + 모듈 추가
              </button>
            </form>
          </Card>
        </div>

        <Card className="h-fit">
          <p className="mb-3 text-sm font-bold">강의 소개</p>
          <form action={saveCourseMeta} className="space-y-2.5 text-sm">
            <input type="hidden" name="courseId" value={tree.course.id} />
            <input type="hidden" name="productId" value={productId} />
            <label className="block">
              <span className="text-xs text-zinc-500">제목</span>
              <input
                name="title"
                defaultValue={tree.course.title}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">설명</span>
              <textarea
                name="description"
                defaultValue={tree.course.description ?? ""}
                className="mt-1 h-20 w-full rounded border px-2 py-1"
              />
            </label>
            <button className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white">
              저장
            </button>
          </form>
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            영상은 유튜브 <b>일부공개(목록에 없음)</b>로 업로드 후 영상 ID나
            URL을 붙여넣으세요. 강의실은 결제한 사람에게만 보이고,
            <b>맛보기</b>로 체크한 레슨은 비구매자에게도 열립니다.
          </p>
        </Card>
      </div>
    </>
  );
}
