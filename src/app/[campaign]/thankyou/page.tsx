import { ThankYouView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "신청 완료", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export default async function CampaignThankYou({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/thankyou");
  const { l } = await searchParams;
  return <ThankYouView campaign={campaign} l={l} />;
}
