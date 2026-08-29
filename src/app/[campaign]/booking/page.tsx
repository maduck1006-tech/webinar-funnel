import { BookingView } from "@/components/funnel-views";
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
