import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { WizardShell } from "../../_wizard";
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
  const exit =
    sp.return && sp.return.startsWith("/") ? sp.return : "/admin/products";

  return (
    <WizardShell title="새 상품 만들기" exitHref={exit}>
      <ProductWizard
        campaignId={sp.campaign ?? ""}
        campaignName={campaignName}
        placement={sp.placement ?? "both"}
        returnTo={sp.return ?? ""}
      />
    </WizardShell>
  );
}
