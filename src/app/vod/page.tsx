import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "무료 강의 시청", robots: { index: false, follow: false } };
import { getDefaultCampaign } from "@/lib/campaign";
import { VodView } from "@/components/funnel-views";

// 4단계 · VOD 시청 — 기본 캠페인
export default async function VodPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; preview?: string; paid?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l, preview, paid } = await searchParams;
  return <VodView campaign={campaign} l={l} preview={preview} paid={paid} />;
}
