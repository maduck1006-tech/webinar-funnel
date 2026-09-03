import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { PageHeader, Card } from "@/components/admin-ui";
import { campaignBasePath } from "@/lib/campaign";
import { getCampaignFlow, SYSTEM_TRANSITIONS } from "@/lib/flow";
import { CampaignTabs } from "../CampaignTabs";
import { FunnelStepBuilder } from "../FunnelStepBuilder";
import { FlowClient } from "../../../flow/FlowClient";

export const dynamic = "force-dynamic";

export default async function CampaignFunnelTab({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id));
  if (!campaign) notFound();

  const basePath = campaignBasePath(campaign);
  const nodes = await getCampaignFlow(campaign.id, basePath).catch(() => []);

  return (
    <>
      <PageHeader
        title={`${campaign.name} · 퍼널`}
        desc="단계를 넣고 빼고 순서를 바꾸세요. 아래는 실제 페이지가 어떻게 연결되는지 보는 지도입니다."
      />
      <CampaignTabs
        id={id}
        slug={campaign.slug}
        live={campaign.funnelType === "live_webinar_reg"}
      />

      <FunnelStepBuilder campaign={campaign} />

      <Card className="mt-6 p-0">
        <p className="border-b px-4 py-3 text-sm font-bold">
          시각 흐름도
          <span className="ml-2 font-normal text-zinc-400">
            점선 = 시스템 전환(웹훅·문자)
          </span>
        </p>
        <div className="h-[560px]">
          <FlowClient
            campaignId={campaign.id}
            basePath={basePath}
            nodes={nodes}
            systemTransitions={SYSTEM_TRANSITIONS}
          />
        </div>
      </Card>
    </>
  );
}
