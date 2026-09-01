import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import {
  Card,
  EmptyRow,
  PageHeader,
  Tag,
  fmtDate,
  won,
} from "@/components/admin-ui";
import { ImagePicker } from "@/components/ImagePicker";
import { saveProduct, toggleProduct } from "./actions";

export const dynamic = "force-dynamic";

async function getProducts(): Promise<Product[]> {
  try {
    return await db.select().from(products).orderBy(desc(products.createdAt));
  } catch {
    return [];
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const list = await getProducts();
  const editing = list.find((p) => p.id === edit) ?? null;

  return (
    <>
      <PageHeader
        title="상품 관리"
        desc="저가 상품 등록 · 결제 페이지 URL 을 넣으면 퍼널 CTA 버튼({{checkout}})에 자동 연결됩니다"
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-500">
                <th className="pb-2">상품명</th>
                <th className="pb-2">가격</th>
                <th className="pb-2">상태</th>
                <th className="pb-2">결제 연결</th>
                <th className="pb-2">노출기간</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.length === 0 && <EmptyRow colSpan={6} text="등록된 상품 없음" />}
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 font-medium">
                    <span className="flex items-center gap-2">
                      {p.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-8 w-8 rounded object-cover"
                        />
                      )}
                      {p.name}
                    </span>
                  </td>
                  <td className="py-2">
                    {p.compareAtPrice && p.compareAtPrice > p.price && (
                      <span className="mr-1 text-zinc-400 line-through">
                        {won(p.compareAtPrice)}
                      </span>
                    )}
                    {won(p.price)}
                  </td>
                  <td className="py-2">
                    <Tag tone={p.active ? "green" : "gray"}>
                      {p.active ? "노출중" : "중지"}
                    </Tag>
                  </td>
                  <td className="py-2">
                    <Tag tone="blue">토스 결제</Tag>
                  </td>
                  <td className="py-2 text-xs text-zinc-500">
                    {p.showFrom || p.showUntil
                      ? `${fmtDate(p.showFrom)} ~ ${fmtDate(p.showUntil)}`
                      : "상시"}
                  </td>
                  <td className="py-2 text-right">
                    <a
                      href={`/admin/products?edit=${p.id}`}
                      className="mr-2 text-xs text-blue-600 underline"
                    >
                      수정
                    </a>
                    <form action={toggleProduct} className="inline">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(!p.active)}
                      />
                      <button className="text-xs text-zinc-500 underline">
                        {p.active ? "중지" : "노출"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-bold">
            {editing ? "상품 수정" : "새 상품 등록"}
          </p>
          <form action={saveProduct} className="space-y-2 text-sm">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <ImagePicker
              name="imageUrl"
              label="상품 이미지"
              defaultValue={editing?.imageUrl ?? ""}
            />
            <Field name="name" label="상품명" defaultValue={editing?.name} />

            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs font-semibold text-zinc-700">
                  상품 타입
                </span>
                <select
                  name="type"
                  defaultValue={editing?.type ?? "workbook"}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                >
                  <option value="workbook">워크북/자료</option>
                  <option value="ebook">전자책</option>
                  <option value="vod_course">VOD 강의</option>
                  <option value="coaching">1:1 코칭</option>
                  <option value="membership">멤버십</option>
                </select>
              </label>
              <label className="block flex-1">
                <span className="text-xs font-semibold text-zinc-700">
                  가격 모드
                </span>
                <select
                  name="priceMode"
                  defaultValue={editing?.priceMode ?? "paid"}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                >
                  <option value="paid">유료</option>
                  <option value="free">무료 (체크아웃 스킵)</option>
                </select>
              </label>
            </div>

            <div className="flex gap-2">
              <Field
                name="price"
                label="판매가 (원)"
                className="block flex-1"
                defaultValue={editing?.price?.toString()}
              />
              <Field
                name="compareAtPrice"
                label="정가 (선택)"
                className="block flex-1"
                defaultValue={editing?.compareAtPrice?.toString()}
              />
            </div>
            <div className="flex gap-2">
              <Field
                name="accessDays"
                label="열람/수강 기한 (일 · 비우면 무제한)"
                className="block flex-1"
                defaultValue={editing?.accessDays?.toString()}
              />
              <Field
                name="deliveryAssetUrl"
                label="전자책 파일 URL (type=전자책)"
                className="block flex-1"
                defaultValue={
                  (editing?.delivery?.assetUrl as string | undefined) ?? ""
                }
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              정가를 넣으면 <b>취소선 + 할인율</b>이 자동 표시됩니다.
            </p>

            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
              결제는 자체 토스 결제창(<code>/checkout</code>)으로 진행됩니다.
              CTA 버튼(<code>{`{{checkout}}`}</code>)이 여기로 연결됩니다.
            </p>

            <label className="block">
              <span className="text-xs font-semibold text-zinc-700">
                토스 주문명 (선택)
              </span>
              <input
                name="tossOrderName"
                defaultValue={editing?.tossOrderName ?? undefined}
                placeholder="비워두면 상품명 사용"
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
              />
              <span className="mt-1 block text-[11px] text-zinc-400">
                토스 결제창에 표시되는 주문명. 비워두면 상품명을 그대로 사용합니다.
              </span>
            </label>

            <label className="block">
              <span className="text-xs text-zinc-500">설명 (선택)</span>
              <textarea
                name="description"
                defaultValue={editing?.description ?? ""}
                className="mt-1 h-16 w-full rounded border px-2 py-1"
              />
            </label>

            <fieldset className="rounded-lg border p-3">
              <legend className="px-1 text-xs text-zinc-500">
                어느 페이지에 노출할까요?
              </legend>
              {[
                {
                  v: "both",
                  t: "땡큐 + VOD 시청 페이지 모두",
                  d: "권장 · 3단계와 4단계 하단 두 곳에 노출",
                },
                { v: "thankyou", t: "땡큐 페이지만", d: "3단계(신청 직후)에서만" },
                {
                  v: "vod_bottom",
                  t: "VOD 시청 페이지만",
                  d: "4단계 영상 아래에서만",
                },
              ].map((o) => (
                <label
                  key={o.v}
                  className="mt-1.5 flex cursor-pointer items-start gap-2"
                >
                  <input
                    type="radio"
                    name="placement"
                    value={o.v}
                    defaultChecked={(editing?.placement ?? "both") === o.v}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm">{o.t}</span>
                    <span className="block text-[11px] text-zinc-400">
                      {o.d}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs text-zinc-500">
                주문서 추가 오퍼 (선택) — 오더 범프 · 원클릭 업셀
              </summary>
              <p className="mt-2 text-[11px] text-zinc-400">
                주문서에 붙는 추가 오퍼입니다. 연결할 상품도 활성 상태여야 합니다.
              </p>

              <label className="mt-3 block">
                <span className="text-xs font-semibold text-zinc-700">
                  오더 범프 상품
                </span>
                <span className="block text-[11px] text-zinc-400">
                  주문서에 체크박스로 붙는 소액 추가상품. 같은 결제에 합산됩니다.
                </span>
                <ProductSelect
                  name="bumpProductId"
                  list={list}
                  excludeId={editing?.id}
                  selected={editing?.bumpProductId ?? ""}
                />
              </label>
              <label className="mt-2 block">
                <span className="text-[11px] text-zinc-400">
                  범프 체크박스 문구 (비우면 상품 설명 사용)
                </span>
                <input
                  name="bumpDescription"
                  defaultValue={editing?.bumpDescription ?? undefined}
                  placeholder="예: 실전 템플릿 30종도 함께 받기"
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-xs font-semibold text-zinc-700">
                  원클릭 업셀(OTO) 상품
                </span>
                <span className="block text-[11px] text-zinc-400">
                  결제 완료 직후 뜨는 업셀. 저장된 카드로 &apos;네&apos; 한 번에 결제.
                </span>
                <ProductSelect
                  name="upsellProductId"
                  list={list}
                  excludeId={editing?.id}
                  selected={editing?.upsellProductId ?? ""}
                />
              </label>
              <label className="mt-2 block">
                <span className="text-xs font-semibold text-zinc-700">
                  다운셀 상품 (업셀 거절 시)
                </span>
                <ProductSelect
                  name="downsellProductId"
                  list={list}
                  excludeId={editing?.id}
                  selected={editing?.downsellProductId ?? ""}
                />
              </label>
            </details>

            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs text-zinc-500">
                판매 기간 정하기 (선택) — 비워두면 상시 판매
              </summary>
              <div className="mt-2 flex gap-2">
                <label className="block flex-1">
                  <span className="text-[11px] text-zinc-400">시작일</span>
                  <input
                    type="date"
                    name="showFrom"
                    defaultValue={editing?.showFrom
                      ?.toISOString()
                      .slice(0, 10)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
                <label className="block flex-1">
                  <span className="text-[11px] text-zinc-400">종료일</span>
                  <input
                    type="date"
                    name="showUntil"
                    defaultValue={editing?.showUntil
                      ?.toISOString()
                      .slice(0, 10)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
              </div>
            </details>

            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing ? editing.active : true}
              />
              <span className="text-xs">
                지금 노출하기{" "}
                <span className="text-zinc-400">(끄면 퍼널에서 숨김)</span>
              </span>
            </label>
            <button className="w-full rounded-lg bg-black py-2 font-semibold text-white">
              저장
            </button>
            {editing && (
              <Link
                href="/admin/products"
                className="block text-center text-xs text-zinc-500 underline"
              >
                취소하고 새 상품 등록
              </Link>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}

function ProductSelect({
  name,
  list,
  excludeId,
  selected,
}: {
  name: string;
  list: Product[];
  excludeId?: string;
  selected: string;
}) {
  const options = list.filter((p) => p.id !== excludeId);
  return (
    <select
      name={name}
      defaultValue={selected}
      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
    >
      <option value="">— 없음 —</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({won(p.price)})
        </option>
      ))}
    </select>
  );
}

function Field({
  name,
  label,
  defaultValue,
  className = "block",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded border px-2 py-1"
      />
    </label>
  );
}
