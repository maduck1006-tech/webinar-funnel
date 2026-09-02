import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "상담 예약", robots: { index: false, follow: false } };
import { getDefaultCampaign } from "@/lib/campaign";
import { BookingView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

// 5단계 · 상담 예약 — 기본 캠페인
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l } = await searchParams;
  return <BookingView campaign={campaign} l={l} />;
}
