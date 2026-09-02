import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "신청 완료", robots: { index: false, follow: false } };
import { getDefaultCampaign } from "@/lib/campaign";
import { ThankYouView } from "@/components/funnel-views";

// 3단계 · 땡큐 + 저가상품 — 기본 캠페인
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l } = await searchParams;
  return <ThankYouView campaign={campaign} l={l} />;
}
