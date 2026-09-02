import { SalesView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "안내", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export default async function CampaignSales({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string; p?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/sales");
  const { l, p } = await searchParams;
  return <SalesView campaign={campaign} l={l} p={p} />;
}
