import { notFound } from "next/navigation";
import { getDefaultCampaign } from "@/lib/campaign";
import { SalesView } from "@/components/funnel-views";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; p?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l, p } = await searchParams;
  return <SalesView campaign={campaign} l={l} p={p} />;
}
