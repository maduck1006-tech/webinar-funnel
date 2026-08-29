import "server-only";
import type { FunnelData } from "@/puck/defaults";
import { getCampaignPageData } from "@/lib/campaign";
import {
  FUNNEL_PAGE_TYPES,
  resolvePageType,
  type Exit,
  type FunnelNode,
} from "@/lib/flow-types";

export * from "@/lib/flow-types";

function extractExits(data: FunnelData, basePath: string): Exit[] {
  const content = (data.content ?? []) as {
    type: string;
    props: Record<string, unknown> & { id: string };
  }[];
  const exits: Exit[] = [];
  for (const block of content) {
    if (block.type === "LeadForm") {
      const target = String(block.props.nextPath ?? "");
      exits.push({
        blockId: block.props.id,
        blockType: "LeadForm",
        label: "폼 제출",
        target,
        targetType: resolvePageType(target, basePath),
      });
    }
    if (block.type === "CTAButton") {
      const target = String(block.props.href ?? "");
      exits.push({
        blockId: block.props.id,
        blockType: "CTAButton",
        label: `버튼: ${String(block.props.label ?? "")}`,
        target,
        targetType: resolvePageType(target, basePath),
      });
    }
  }
  return exits;
}

export async function getCampaignFlow(
  campaignId: string,
  basePath: string,
): Promise<FunnelNode[]> {
  return Promise.all(
    FUNNEL_PAGE_TYPES.map(async (pageType) => ({
      pageType,
      exits: extractExits(await getCampaignPageData(campaignId, pageType), basePath),
    })),
  );
}
