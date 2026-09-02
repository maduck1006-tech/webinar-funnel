import { DeliveryView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "다운로드", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export const dynamic = "force-dynamic";

export default async function CampaignDownload({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string; p?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/download");
  const { l, p } = await searchParams;
  return <DeliveryView campaign={campaign} l={l} p={p} />;
}
