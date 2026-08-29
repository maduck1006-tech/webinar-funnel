import { notFound } from "next/navigation";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { previewEnabled } from "@/lib/preview";
import {
  campaignBasePath,
  getDefaultCampaign,
  listCampaigns,
  resolveCampaignSlug,
} from "@/lib/campaign";
import { PreviewCanvas } from "./PreviewCanvas";

export const dynamic = "force-dynamic";

// 개발용 전체 화면 오버뷰 (Figma 처럼 한눈에). 프로덕션에서는 비활성.
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  if (!previewEnabled()) notFound();
  const { campaign: slug } = await searchParams;

  const [campaignOptions, chosen] = await Promise.all([
    listCampaigns(),
    slug
      ? resolveCampaignSlug(slug).then((r) => r?.campaign ?? null)
      : getDefaultCampaign(),
  ]);

  let leadId: string | null = null;
  try {
    const [row] = await db.select({ id: leads.id }).from(leads).limit(1);
    leadId = row?.id ?? null;
  } catch {
    /* DB 미연결 */
  }

  return (
    <PreviewCanvas
      leadId={leadId}
      basePath={chosen ? campaignBasePath(chosen) : ""}
      campaignSlug={chosen?.slug ?? ""}
      campaigns={campaignOptions.map((c) => ({ slug: c.slug, name: c.name }))}
    />
  );
}
