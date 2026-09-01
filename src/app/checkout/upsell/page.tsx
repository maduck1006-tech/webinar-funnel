import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, products } from "@/db/schema";
import { resolveLeadId } from "@/lib/lead";

export const dynamic = "force-dynamic";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/**
 * 원클릭 업셀(OTO) / 다운셀 페이지. 결제 완료 직후 노출되는 단일 오퍼.
 *  ?p = 오퍼 상품, ?l = 리드, ?d = 1 이면 다운셀(더 이상 체이닝 안 함)
 * 수락 → /checkout?p=&l=&role=upsell(또는 downsell) 로 재결제
 * 거절 → 오퍼상품에 다운셀이 걸려 있으면 다운셀로, 아니면 /vod?paid=1
 *
 * ⚠️ 진짜 '1클릭'(카드 재입력 없음)은 토스 자동결제(빌링) 계약 후 가능.
 *    현재는 저장카드 없이 결제창을 다시 띄우는 방식(빠른 재결제).
 */
export default async function UpsellPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; l?: string; d?: string }>;
}) {
  const { p: productId, l: lParam, d } = await searchParams;
  const isDownsell = d === "1";

  const leadId = await resolveLeadId(lParam);
  const leadQs = leadId ? `&l=${leadId}` : "";

  let basePath = "";
  if (leadId) {
    const [lead] = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(eq(leads.id, leadId));
    if (lead?.campaignId) {
      const [c] = await db
        .select({ slug: campaigns.slug, isDefault: campaigns.isDefault })
        .from(campaigns)
        .where(eq(campaigns.id, lead.campaignId));
      if (c && !c.isDefault) basePath = `/${c.slug}`;
    }
  }
  const vodUrl = `${basePath}/vod?paid=1${leadQs}`;

  if (!productId) redirect(vodUrl);

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product || !product.active) redirect(vodUrl);

  const acceptUrl = `${basePath}/checkout?p=${product.id}${leadQs}&role=${
    isDownsell ? "downsell" : "upsell"
  }`;
  const declineUrl =
    !isDownsell && product.downsellProductId
      ? `${basePath}/checkout/upsell?p=${product.downsellProductId}${leadQs}&d=1`
      : vodUrl;

  return (
    <div
      className="funnel-theme flex min-h-dvh items-center justify-center px-5 py-10"
      style={{ background: "var(--fn-bg)" }}
    >
      <div className="w-full max-w-[440px] text-center">
        <p className="text-xs font-bold tracking-wide text-[var(--fn-accent)]">
          {isDownsell ? "그럼 이건 어떠세요?" : "잠깐만요 — 결제 전 마지막 제안"}
        </p>
        <h1 className="mt-2 text-xl font-extrabold leading-snug text-white">
          {product.name}
        </h1>

        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="mx-auto mt-4 w-full rounded-xl object-cover"
          />
        )}

        {product.description && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/70">
            {product.description}
          </p>
        )}

        <p className="mt-5 text-white/60">
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="mr-1.5 line-through">
              {won(product.compareAtPrice)}
            </span>
          )}
          <span className="text-2xl font-extrabold text-white">
            {won(product.price)}
          </span>
          <span className="ml-1 text-xs">지금만</span>
        </p>

        <a
          href={acceptUrl}
          className="mt-6 block w-full rounded-xl py-4 text-base font-bold text-white"
          style={{ background: "var(--fn-accent)" }}
        >
          네, 추가할게요 · {won(product.price)}
        </a>
        <a
          href={declineUrl}
          className="mt-3 block text-sm text-white/45 underline"
        >
          아니요, 괜찮습니다
        </a>
      </div>
    </div>
  );
}
