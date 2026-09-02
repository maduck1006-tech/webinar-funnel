import { BookingView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "상담 예약", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export const dynamic = "force-dynamic";

export default async function CampaignBooking({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/booking");
  const { l } = await searchParams;
  return <BookingView campaign={campaign} l={l} />;
}
