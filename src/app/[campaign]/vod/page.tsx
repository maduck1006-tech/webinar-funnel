import { VodView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "무료 강의 시청", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export default async function CampaignVod({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string; preview?: string; paid?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/vod");
  const { l, preview, paid } = await searchParams;
  return <VodView campaign={campaign} l={l} preview={preview} paid={paid} />;
}
