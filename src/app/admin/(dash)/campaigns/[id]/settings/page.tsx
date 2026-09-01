import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, campaigns, products } from "@/db/schema";
import { Card, PageHeader, Tag } from "@/components/admin-ui";
import { setCampaignProduct, updateCampaign } from "../../actions";

export const dynamic = "force-dynamic";

export default async function CampaignSettings({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) notFound();

  const allProducts = await db
    .select()
    .from(products)
    .orderBy(asc(products.createdAt));
  const mapped = await db
    .select()
    .from(campaignProducts)
    .where(eq(campaignProducts.campaignId, id));
  const mappedMap = new Map(mapped.map((m) => [m.productId, m.placement]));

  const iso = (d: Date | null) =>
    d ? d.toISOString().slice(0, 16) : undefined;

  return (
    <>
      <PageHeader
        title={`${c.name} · 설정`}
        desc={
          <Link
            href={`/admin/campaigns/${id}`}
            className="text-blue-600 underline"
          >
            ← 캠페인
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-sm font-bold">기본 / 콘텐츠</p>
          <form action={updateCampaign} className="space-y-2.5 text-sm">
            <input type="hidden" name="id" value={id} />
            <F label="이름" name="name" defaultValue={c.name} />
            <F
              label="URL slug (변경 시 이전 주소는 자동 리다이렉트)"
              name="slug"
              defaultValue={c.slug}
              mono
            />
            <F
              label="VOD 영상 링크 (YouTube · Vimeo · MP4)"
              name="vodSrc"
              defaultValue={c.vodSrc ?? ""}
            />
            <F
              label="시청 기한 (시간)"
              name="vodWindowHours"
              defaultValue={String(c.vodWindowHours)}
            />
            <F
              label="되는시간 임베드 URL"
              name="bookingEmbedUrl"
              defaultValue={c.bookingEmbedUrl ?? ""}
            />
            <F
              label="워크북 다운로드 URL (문자 {다운로드링크} 변수 · 비우면 시청 링크)"
              name="downloadUrl"
              defaultValue={c.downloadUrl ?? ""}
            />
            <F
              label="결제 후 이동 URL (비우면 /slug/vod?paid=1 · 전환 픽셀 자동)"
              name="checkoutRedirectUrl"
              defaultValue={c.checkoutRedirectUrl ?? ""}
            />

            <p className="pt-2 text-xs font-semibold text-zinc-500">카운트다운</p>
            <label className="block">
              <span className="text-xs text-zinc-500">모드</span>
              <select
                name="countdownMode"
                defaultValue={c.countdownMode}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="none">없음</option>
                <option value="fixed">고정 마감일</option>
                <option value="evergreen">에버그린(진입 후 N초)</option>
              </select>
            </label>
            <F
              label="고정 마감일 (fixed)"
              name="countdownDeadline"
              type="datetime-local"
              defaultValue={iso(c.countdownDeadline)}
            />
            <F
              label="에버그린 지속(초) (evergreen)"
              name="countdownRushSeconds"
              defaultValue={
                c.countdownRushSeconds ? String(c.countdownRushSeconds) : ""
              }
            />

            <p className="pt-2 text-xs font-semibold text-zinc-500">추적</p>
            <F
              label="Meta 픽셀 ID"
              name="metaPixelId"
              defaultValue={c.metaPixelId ?? ""}
            />
            <F
              label="GA4 측정 ID (G-XXXX)"
              name="ga4MeasurementId"
              defaultValue={c.ga4MeasurementId ?? ""}
            />
            <F
              label="기본 utm_campaign"
              name="defaultUtmCampaign"
              defaultValue={c.defaultUtmCampaign ?? c.slug}
            />
            <F
              label="Meta 광고 계정 ID (숫자만 · 비우면 전역 기본값)"
              name="metaAdAccountId"
              defaultValue={c.metaAdAccountId ?? ""}
              mono
            />
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">
                Meta 광고 캠페인 ID (쉼표/줄바꿈 구분 · 비우면 계정 전체
                광고비를 기본 캠페인에 귀속)
              </span>
              <textarea
                name="metaAdCampaignIds"
                rows={2}
                defaultValue={(c.metaAdCampaignIds ?? []).join(", ")}
                className="w-full rounded-md border px-2 py-1 font-mono text-xs"
              />
            </label>

            <button className="mt-2 w-full rounded-lg bg-black py-2 font-semibold text-white">
              저장
            </button>
          </form>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-bold">연결 상품</p>
          <p className="mb-3 text-xs text-zinc-400">
            체크한 상품이 이 캠페인의 CTA(<code>{"{{checkout}}"}</code>)와 가격
            블록에 연결됩니다.
          </p>
          <ul className="divide-y text-sm">
            {allProducts.length === 0 && (
              <li className="py-3 text-zinc-400">
                등록된 상품 없음 —{" "}
                <Link href="/admin/products" className="text-blue-600 underline">
                  상품 관리
                </Link>
              </li>
            )}
            {allProducts.map((p) => {
              const on = mappedMap.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 py-2.5">
                  <form action={setCampaignProduct} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="campaignId" value={id} />
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="remove" value={on ? "true" : "false"} />
                    <button
                      className={`h-5 w-5 rounded border ${on ? "bg-black" : "bg-white"}`}
                      aria-label="toggle"
                    >
                      {on && <span className="text-xs text-white">✓</span>}
                    </button>
                    <span className="flex-1">{p.name}</span>
                    {!p.active && <Tag tone="gray">중지</Tag>}
                  </form>
                  {on && (
                    <form action={setCampaignProduct} className="flex items-center gap-1">
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="remove" value="false" />
                      <select
                        name="placement"
                        defaultValue={mappedMap.get(p.id)}
                        className="rounded border px-1 py-0.5 text-xs"
                      >
                        <option value="both">양쪽</option>
                        <option value="thankyou">땡큐만</option>
                        <option value="vod_bottom">VOD만</option>
                      </select>
                      <button className="rounded border px-2 text-xs">적용</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function F({
  label,
  name,
  defaultValue,
  type = "text",
  mono = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className={`mt-1 w-full rounded border px-2 py-1 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}
