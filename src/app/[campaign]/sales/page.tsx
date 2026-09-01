import { SalesView } from "@/components/funnel-views";
import { resolveOr404 } from "../_resolve";

export default async function CampaignSales({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/sales");
  const { l } = await searchParams;
  return <SalesView campaign={campaign} l={l} />;
}
