import type { ReactNode } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, campaigns, products, type Product } from "@/db/schema";
import { Card, PageHeader, Tag, fmtDate, won } from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { SubmitButton } from "../form-ui";
import { ImagePicker } from "@/components/ImagePicker";
import { saveProduct, toggleProduct } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_META: Record<
  string,
  { icon: string; label: string; need: string }
> = {
  workbook: {
    icon: "📄",
    label: "워크북 / 자료",
    need: "결제하면 문자·보관함으로 자료를 전달합니다. 파일은 캠페인 설정의 다운로드 링크나 보관함을 씁니다.",
  },
  ebook: {
    icon: "📕",
    label: "전자책",
    need: "아래 '전자책 파일 URL'에 PDF 링크를 넣으면 결제 후 자동 전달됩니다.",
  },
  vod_course: {
    icon: "🎬",
    label: "VOD 강의",
    need: "먼저 저장한 뒤, 상품 목록의 '강의 구성'에서 커리큘럼·영상을 넣으세요.",
  },
  coaching: {
    icon: "🗓️",
    label: "1:1 코칭",
    need: "결제하면 상담 예약 안내로 이어집니다. 예약 캘린더는 캠페인 설정에서 연결하세요.",
  },
  membership: {
    icon: "♾️",
    label: "멤버십 (구독)",
    need: "'멤버십 무료 개월'을 정하면 그 기간이 지난 뒤 매달 자동결제로 전환됩니다.",
  },
};

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

  // 상품이 어느 캠페인에 연결됐는지
  const linkMap = new Map<string, string[]>();
  try {
    const cps = await db
      .select({
        productId: campaignProducts.productId,
        name: campaigns.name,
      })
      .from(campaignProducts)
      .innerJoin(campaigns, eq(campaigns.id, campaignProducts.campaignId));
    for (const cp of cps) {
      linkMap.set(cp.productId, [...(linkMap.get(cp.productId) ?? []), cp.name]);
    }
  } catch {
    /* noop */
  }

  return (
    <>
      <PageHeader
        title="상품 관리"
        desc="퍼널에서 판매할 상품을 등록하는 곳. CTA 버튼을 {{checkout}} 으로 두면 여기 상품의 결제창으로 자동 연결됩니다."
      />

      <SectionTabs set="product" />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── 목록 ── */}
        <div className="space-y-3">
          {list.length === 0 && (
            <Card>
              <p className="py-8 text-center text-sm text-zinc-400">
                등록된 상품이 없어요. 오른쪽에서 첫 상품을 만들어보세요.
              </p>
            </Card>
          )}

          {list.map((p) => {
            const t = TYPE_META[p.type] ?? {
              icon: "📦",
              label: p.type,
              need: "",
            };
            const linkedCampaigns = linkMap.get(p.id) ?? [];
            const off = p.compareAtPrice && p.compareAtPrice > p.price
              ? Math.round((1 - p.price / p.compareAtPrice) * 100)
              : 0;
            return (
              <Card
                key={p.id}
                className={!p.active ? "opacity-60" : ""}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[var(--fn-bg-2)] text-xl">
                        {t.icon}
                      </div>
                    )}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-900">
                          {p.name}
                        </span>
                        <Tag tone="gray">
                          {t.icon} {t.label}
                        </Tag>
                        <Tag tone={p.active ? "green" : "gray"}>
                          {p.active ? "판매중" : "중지"}
                        </Tag>
                        {p.priceMode === "free" && <Tag tone="blue">무료</Tag>}
                      </div>

                      <p className="text-sm">
                        {p.priceMode === "free" ? (
                          <span className="font-bold text-zinc-900">무료</span>
                        ) : (
                          <>
                            {off > 0 && (
                              <>
                                <span className="mr-1 text-zinc-400 line-through">
                                  {won(p.compareAtPrice!)}
                                </span>
                                <span className="mr-1 text-red-500">
                                  {off}%
                                </span>
                              </>
                            )}
                            <span className="font-bold text-zinc-900">
                              {won(p.price)}
                            </span>
                          </>
                        )}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        {linkedCampaigns.length > 0 ? (
                          <span>· 연결 캠페인: {linkedCampaigns.join(", ")}</span>
                        ) : (
                          <span className="text-amber-600">
                            · 아직 캠페인에 연결 안 됨
                          </span>
                        )}
                        <span>
                          ·{" "}
                          {p.showFrom || p.showUntil
                            ? `${fmtDate(p.showFrom)} ~ ${fmtDate(p.showUntil)}`
                            : "상시 판매"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs sm:border-0 sm:pt-0">
                    {p.type === "vod_course" && (
                      <Link
                        href={`/admin/products/${p.id}/course`}
                        className="text-blue-600 underline"
                      >
                        강의 구성
                      </Link>
                    )}
                    <a
                      href={`/checkout?p=${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-400 underline"
                    >
                      결제창 미리보기
                    </a>
                    <Link
                      href={`/admin/products?edit=${p.id}`}
                      className="rounded-lg border px-2.5 py-1 font-semibold text-blue-600 hover:bg-blue-50"
                    >
                      수정
                    </Link>
                    <form action={toggleProduct}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="next" value={String(!p.active)} />
                      <button className="text-zinc-500 underline">
                        {p.active ? "판매중지" : "판매재개"}
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── 등록/수정 폼 ── */}
        <Card className="h-fit">
          <p className="mb-1 text-sm font-bold">
            {editing ? `✏️ '${editing.name}' 수정` : "➕ 새 상품 등록"}
          </p>
          <p className="mb-4 text-[12px] text-zinc-500">
            아래 순서대로 채우면 됩니다. 선택 항목은 나중에 채워도 돼요.
          </p>

          <form action={saveProduct} className="space-y-5 text-sm">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            {/* 1. 무슨 상품 */}
            <FormSection num={1} title="어떤 상품인가요?">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">
                  상품 종류
                </span>
                <select
                  name="type"
                  defaultValue={editing?.type ?? "workbook"}
                  className="mt-1 w-full rounded-lg border px-2.5 py-2"
                >
                  {Object.entries(TYPE_META).map(([v, m]) => (
                    <option key={v} value={v}>
                      {m.icon} {m.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block rounded-lg bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-800">
                  💡{" "}
                  {(TYPE_META[editing?.type ?? "workbook"] ?? TYPE_META.workbook)
                    .need}
                </span>
              </label>
              <ImagePicker
                name="imageUrl"
                label="상품 이미지 (선택)"
                defaultValue={editing?.imageUrl ?? ""}
              />
              <Field name="name" label="상품명" defaultValue={editing?.name} />
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">
                  설명 (선택)
                </span>
                <textarea
                  name="description"
                  defaultValue={editing?.description ?? ""}
                  rows={2}
                  className="mt-1 w-full rounded-lg border px-2.5 py-2"
                />
              </label>
            </FormSection>

            {/* 2. 가격 */}
            <FormSection num={2} title="가격">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">
                  가격 방식
                </span>
                <select
                  name="priceMode"
                  defaultValue={editing?.priceMode ?? "paid"}
                  className="mt-1 w-full rounded-lg border px-2.5 py-2"
                >
                  <option value="paid">유료 — 결제창을 띄웁니다</option>
                  <option value="free">무료 — 결제 없이 바로 지급</option>
                </select>
              </label>
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
              <p className="text-[11px] text-zinc-400">
                정가를 넣으면 퍼널에 <b>취소선 + 할인율</b>이 자동 표시됩니다.
              </p>
            </FormSection>

            {/* 3. 전달 방식 (타입별) */}
            <FormSection num={3} title="전달 방식 (해당하는 것만)">
              <div className="flex gap-2">
                <Field
                  name="accessDays"
                  label="열람 기한 (일 · 비우면 무제한)"
                  className="block flex-1"
                  defaultValue={editing?.accessDays?.toString()}
                />
                <Field
                  name="membershipFreeMonths"
                  label="멤버십 무료 개월 (비우면 1)"
                  className="block flex-1"
                  defaultValue={
                    editing?.membershipFreeMonths
                      ? String(editing.membershipFreeMonths)
                      : ""
                  }
                />
              </div>
              <Field
                name="deliveryAssetUrl"
                label="전자책 파일 URL (전자책일 때)"
                defaultValue={
                  ((editing?.delivery as { assetUrl?: string } | null)?.assetUrl) ?? ""
                }
              />
            </FormSection>

            {/* 4. 퍼널 연결 안내 */}
            <FormSection num={4} title="퍼널에 어떻게 붙이나요?">
              {/* 실제 노출 위치는 campaignProducts.placement — 캠페인 설정에서 지정 */}
              <input
                type="hidden"
                name="placement"
                value={editing?.placement ?? "both"}
              />
              <div className="rounded-lg bg-blue-50 p-3 text-[12px] leading-relaxed text-blue-900">
                이 상품이 <b>어느 퍼널의 어느 지점</b>에 뜨는지는 여기가 아니라{" "}
                <b>캠페인에 연결할 때</b> 정합니다.
                <br />
                <span className="mt-1 block text-blue-700">
                  캠페인 관리 → (캠페인 선택) → &quot;상품 연결&quot;에서 이 상품을
                  체크하고 위치(땡큐 / VOD 하단 / 세일즈 페이지)를 고르세요.
                </span>
                <Link
                  href="/admin/campaigns"
                  className="mt-2 inline-block font-semibold underline"
                >
                  캠페인 관리로 가기 →
                </Link>
              </div>
            </FormSection>

            {/* 5. 추가 매출 → 캠페인별로 이동 */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[12px] leading-relaxed text-blue-900">
              💰 <b>오더 범프 · 원클릭 업셀 · 다운셀</b>은 이제{" "}
              <b>캠페인마다 다르게</b> 설정합니다. (같은 상품을 A 캠페인엔 메인, B
              캠페인엔 업셀로 쓸 수 있게)
              <br />
              <span className="mt-1 block text-blue-700">
                캠페인 관리 → (캠페인) → 설정 → 연결 상품 → &quot;+ 추가 오퍼&quot;
              </span>
            </div>

            {/* 6. 번들 */}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600">
                🎁 번들 · 크로스셀 (선택)
              </summary>
              <p className="mt-2 text-[11px] text-zinc-700">
                번들 구성 상품 (체크하면 이 상품 결제 시 함께 지급)
              </p>
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                {list
                  .filter((x) => x.id !== editing?.id)
                  .map((x) => (
                    <label
                      key={x.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        name="bundleProductIds"
                        value={x.id}
                        defaultChecked={
                          editing?.bundleProductIds?.includes(x.id) ?? false
                        }
                      />
                      {x.name}
                    </label>
                  ))}
              </div>
              <label className="mt-2 block">
                <span className="text-xs font-medium text-zinc-700">
                  다음 추천 상품 (구매자 보관함 상단에 노출)
                </span>
                <ProductSelect
                  name="nextOfferId"
                  list={list}
                  excludeId={editing?.id}
                  selected={editing?.nextOfferId ?? ""}
                />
              </label>
            </details>

            {/* 7. 판매 기간 + 고급 */}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600">
                📅 판매 기간 · 토스 주문명 (선택)
              </summary>
              <div className="mt-2 flex gap-2">
                <label className="block flex-1">
                  <span className="text-[11px] text-zinc-400">시작일</span>
                  <input
                    type="date"
                    name="showFrom"
                    defaultValue={editing?.showFrom?.toISOString().slice(0, 10)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
                <label className="block flex-1">
                  <span className="text-[11px] text-zinc-400">종료일</span>
                  <input
                    type="date"
                    name="showUntil"
                    defaultValue={editing?.showUntil?.toISOString().slice(0, 10)}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
              </div>
              <label className="mt-2 block">
                <span className="text-[11px] text-zinc-400">
                  토스 결제창 주문명 (비우면 상품명)
                </span>
                <input
                  name="tossOrderName"
                  defaultValue={editing?.tossOrderName ?? undefined}
                  placeholder="비워두면 상품명 사용"
                  className="mt-1 w-full rounded border px-2.5 py-1.5"
                />
              </label>
            </details>

            <label className="flex items-center gap-2 rounded-lg bg-[var(--fn-bg-2)] p-2.5">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing ? editing.active : true}
              />
              <span className="text-xs">
                <b>지금 판매하기</b>{" "}
                <span className="text-zinc-400">(끄면 퍼널에서 숨김)</span>
              </span>
            </label>

            <SubmitButton className="w-full rounded-lg bg-black py-2.5 font-semibold text-white">
              {editing ? "수정 저장" : "상품 등록"}
            </SubmitButton>
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

function FormSection({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-2 text-xs font-bold text-zinc-700">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-black text-[10px] text-white">
          {num}
        </span>
        {title}
      </p>
      {children}
    </div>
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
      className="mt-1 w-full rounded border px-2.5 py-1.5 text-sm"
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
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-lg border px-2.5 py-2"
      />
    </label>
  );
}
