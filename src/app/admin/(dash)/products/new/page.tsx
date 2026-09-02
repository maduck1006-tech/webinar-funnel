import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { ProductWizard } from "./ProductWizard";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{
    campaign?: string;
    placement?: string;
    return?: string;
  }>;
}) {
  const sp = await searchParams;
  let campaignName: string | null = null;
  if (sp.campaign) {
    const [c] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, sp.campaign));
    campaignName = c?.name ?? null;
  }

  return (
    <div className="mx-auto max-w-[560px] py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">새 상품 만들기</h1>
        <Link
          href={sp.return && sp.return.startsWith("/") ? sp.return : "/admin/products"}
          className="text-xs text-zinc-500 underline"
        >
          나가기
        </Link>
      </div>
      <ProductWizard
        campaignId={sp.campaign ?? ""}
        campaignName={campaignName}
        placement={sp.placement ?? "both"}
        returnTo={sp.return ?? ""}
      />
    </div>
  );
}
