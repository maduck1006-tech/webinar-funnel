import { asc } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { FUNNEL_TEMPLATES } from "@/lib/funnel-templates";
import { RESERVED_SLUGS } from "@/lib/campaign";
import { STEP_META } from "@/lib/funnel-flow";
import { WizardShell } from "../../_wizard";
import { CampaignWizard } from "./CampaignWizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  let sources: (typeof campaigns.$inferSelect)[] = [];
  try {
    sources = await db.select().from(campaigns).orderBy(asc(campaigns.name));
  } catch {
    /* db 미연결 */
  }

  const templates = FUNNEL_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    tagline: t.tagline,
    icon: t.icon,
    stepTitles: t.steps.map((s) => STEP_META[s]?.title ?? s),
    automations: t.automations.length,
    slots: t.productSlots.length,
  }));

  const siteOrigin = (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      "",
    ) || "내도메인.com"
  ).trim();

  return (
    <WizardShell title="새 캠페인 만들기" exitHref="/admin/campaigns">
      <CampaignWizard
        templates={templates}
        sources={sources.map((s) => ({
          id: s.id,
          name: s.name,
          isTemplate: s.isTemplate,
        }))}
        takenSlugs={sources.map((s) => s.slug)}
        reservedSlugs={[...RESERVED_SLUGS]}
        siteOrigin={siteOrigin}
      />
    </WizardShell>
  );
}
