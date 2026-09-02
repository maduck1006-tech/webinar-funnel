import type { Metadata } from "next";
import { LandingView } from "@/components/funnel-views";
import { landingMetadata } from "@/lib/page-meta";
import { resolveCampaignSlug } from "@/lib/campaign";
import { resolveOr404 } from "./_resolve";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campaign: string }>;
}): Promise<Metadata> {
  const { campaign: slug } = await params;
  const res = await resolveCampaignSlug(slug).catch(() => null);
  const campaign = res?.campaign;
  return campaign ? landingMetadata(campaign) : {};
}

export default async function CampaignLanding({
  params,
}: {
  params: Promise<{ campaign: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug);
  return <LandingView campaign={campaign} />;
}
