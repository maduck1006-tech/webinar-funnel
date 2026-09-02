import { GroupChatView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "입장 안내", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export const dynamic = "force-dynamic";

// 5단계(종착) · 무료 단톡방 입장
export default async function CampaignCommunity({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/community");
  const { l } = await searchParams;
  return <GroupChatView campaign={campaign} l={l} />;
}
