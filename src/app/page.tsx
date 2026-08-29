import { notFound } from "next/navigation";
import { getDefaultCampaign } from "@/lib/campaign";
import { LandingView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

// 2단계 · 랜딩(신청) — 기본 캠페인
export default async function HomePage() {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  return <LandingView campaign={campaign} />;
}
