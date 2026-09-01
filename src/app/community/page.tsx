import { notFound } from "next/navigation";
import { getDefaultCampaign } from "@/lib/campaign";
import { GroupChatView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

// 5단계(종착) · 무료 단톡방 입장 — 기본 캠페인
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l } = await searchParams;
  return <GroupChatView campaign={campaign} l={l} />;
}
