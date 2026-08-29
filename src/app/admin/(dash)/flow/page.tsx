import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin-ui";
import {
  campaignBasePath,
  getDefaultCampaign,
  resolveCampaignSlug,
} from "@/lib/campaign";
import { getCampaignFlow, SYSTEM_TRANSITIONS } from "@/lib/flow";
import { FlowClient } from "./FlowClient";

export const dynamic = "force-dynamic";

// 캠페인 퍼널 페이지 흐름도 (?campaign=slug, 기본은 대표 캠페인)
export default async function FlowPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: slug } = await searchParams;
  const campaign = slug
    ? (await resolveCampaignSlug(slug))?.campaign ?? null
    : await getDefaultCampaign();
  if (!campaign) notFound();

  const basePath = campaignBasePath(campaign);
  const nodes = await getCampaignFlow(campaign.id, basePath);

  return (
    <div className="-m-8 flex h-dvh flex-col">
      <div className="border-b bg-white px-8 py-4">
        <PageHeader
          title={`퍼널 흐름도 · ${campaign.name}`}
          desc="각 페이지의 이동(폼 제출·버튼)을 시각화하고 연결 대상을 바꿉니다. 점선 = 시스템 전환(웹훅/문자)."
        />
      </div>
      <div className="min-h-0 flex-1">
        <FlowClient
          campaignId={campaign.id}
          basePath={basePath}
          nodes={nodes}
          systemTransitions={SYSTEM_TRANSITIONS}
        />
      </div>
    </div>
  );
}
