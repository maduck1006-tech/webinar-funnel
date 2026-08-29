import { notFound } from "next/navigation";
import { getCampaignById, getCampaignPageData } from "@/lib/campaign";
import { FUNNEL_PAGE_TYPES, PAGE_META } from "@/lib/flow-types";
import type { PageType } from "@/db/schema";
import { BuilderClient } from "./BuilderClient";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; pageType: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { campaignId, pageType } = await params;
  if (!(FUNNEL_PAGE_TYPES as readonly string[]).includes(pageType)) notFound();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) notFound();

  const { variant: v } = await searchParams;
  const variant = pageType === "landing" && v === "b" ? "b" : "a";

  const data = await getCampaignPageData(
    campaignId,
    pageType as PageType,
    variant,
  );
  const meta = PAGE_META[pageType as PageType];

  return (
    <BuilderClient
      campaignId={campaignId}
      campaignName={campaign.name}
      pageType={pageType as PageType}
      variant={variant}
      pageLabel={`${meta.step} ${meta.title}${
        variant === "b" ? " · 변형 B" : campaign.abLanding && pageType === "landing" ? " · 변형 A" : ""
      }`}
      initialData={data}
    />
  );
}
