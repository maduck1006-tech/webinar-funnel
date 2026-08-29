import { LandingView } from "@/components/funnel-views";
import { resolveOr404 } from "./_resolve";

export const dynamic = "force-dynamic";

export default async function CampaignLanding({
  params,
}: {
  params: Promise<{ campaign: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug);
  return <LandingView campaign={campaign} />;
}
