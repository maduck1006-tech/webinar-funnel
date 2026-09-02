import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDefaultCampaign } from "@/lib/campaign";
import { landingMetadata } from "@/lib/page-meta";
import { LandingView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const campaign = await getDefaultCampaign();
  return campaign ? landingMetadata(campaign) : {};
}

// 2단계 · 랜딩(신청) — 기본 캠페인
export default async function HomePage() {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  return <LandingView campaign={campaign} />;
}
