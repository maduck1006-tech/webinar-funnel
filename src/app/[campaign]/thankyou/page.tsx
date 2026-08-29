import { ThankYouView } from "@/components/funnel-views";
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
