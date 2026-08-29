import { notFound, redirect } from "next/navigation";
import type { Campaign } from "@/db/schema";
import { resolveCampaignSlug } from "@/lib/campaign";

/** [campaign] 세그먼트 → Campaign. redirect/notFound 처리 포함. */
export async function resolveOr404(
  slug: string,
  subPath = "",
): Promise<Campaign> {
  const res = await resolveCampaignSlug(slug);
  if (!res) notFound();
  if (res.redirectTo) redirect(`/${res.redirectTo}${subPath}`);
  const campaign = res.campaign!;
  // 기본 캠페인은 무접두 경로가 정본 — /{slug} 로 오면 / 로 보냄
  if (campaign.isDefault) redirect(subPath || "/");
  return campaign;
}
