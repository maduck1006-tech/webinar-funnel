import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, campaigns, products } from "@/db/schema";
import { WizardShell } from "../../../../_wizard";
import { OfferWizard } from "./OfferWizard";

export const dynamic = "force-dynamic";

export default async function OffersPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>;
}) {
  const { id, productId } = await params;

  const [[c], [product]] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.id, id)),
    db.select().from(products).where(eq(products.id, productId)),
  ]);
  if (!c || !product) notFound();

  const [cp] = await db
    .select()
    .from(campaignProducts)
    .where(
      and(
        eq(campaignProducts.campaignId, id),
        eq(campaignProducts.productId, productId),
      ),
    );

  // 이 상품 자신은 오퍼 후보에서 제외
  const options = (
    await db
      .select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.price))
  ).filter((o) => o.id !== productId);

  return (
    <WizardShell
      title={`추가 매출 설계 · ${product.name}`}
      exitHref={`/admin/campaigns/${id}/settings`}
      exitLabel="취소"
    >
      {options.length === 0 ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-500">
          붙일 수 있는 다른 상품이 없어요. 먼저{" "}
          <a
            href={`/admin/products/new?campaign=${id}&return=${encodeURIComponent(
              `/admin/campaigns/${id}/offers/${productId}`,
            )}`}
            className="font-semibold text-blue-600 underline"
          >
            상품을 하나 더 만들어주세요
          </a>
          .
        </div>
      ) : (
        <OfferWizard
          campaignId={id}
          productId={productId}
          productName={product.name}
          productPrice={product.price}
          options={options}
          initial={{
            bumpProductId: cp?.bumpProductId ?? null,
            bumpDescription: cp?.bumpDescription ?? null,
            upsellProductId: cp?.upsellProductId ?? null,
            downsellProductId: cp?.downsellProductId ?? null,
          }}
        />
      )}
    </WizardShell>
  );
}
