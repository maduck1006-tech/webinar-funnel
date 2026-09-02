import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { WizardShell } from "../../_wizard";
import { AutomationWizard } from "./AutomationWizard";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign } = await searchParams;
  let campaignName: string | null = null;
  if (campaign) {
    const [c] = await db
      .select({ name: campaigns.name })
      .from(campaigns)
      .where(eq(campaigns.id, campaign));
    campaignName = c?.name ?? null;
  }

  return (
    <WizardShell
      title="새 자동 메시지 만들기"
      exitHref={
        campaign ? `/admin/automation?campaign=${campaign}` : "/admin/automation"
      }
    >
      <AutomationWizard
        campaignId={campaign ?? ""}
        campaignName={campaignName}
      />
    </WizardShell>
  );
}
