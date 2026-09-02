import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "다운로드", robots: { index: false, follow: false } };
import { getDefaultCampaign } from "@/lib/campaign";
import { DeliveryView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; p?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l, p } = await searchParams;
  return <DeliveryView campaign={campaign} l={l} p={p} />;
}
