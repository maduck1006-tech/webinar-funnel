import "server-only";
import type { Metadata } from "next";
import type { Campaign } from "@/db/schema";
import { getCampaignPageData } from "@/lib/campaign";

/** 배포 도메인 (OG 절대 URL 용) */
export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://class.launchscale.kr")
  );
}

function clean(s: unknown, max = 110): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/["""]/g, "")
    .trim()
    .slice(0, max);
}

type Block = { type?: string; props?: Record<string, unknown> };

/**
 * 랜딩 Puck 콘텐츠에서 공유 미리보기 재료를 추출한다.
 * - title: 첫 Hero.title / 첫 Heading.text, 없으면 캠페인명
 * - description: 첫 Hero.subtitle / 첫 Text, 없으면 캠페인명
 * - image: 첫 Hero.image / 첫 Image.image (Vercel Blob 절대 URL)
 * 관리자가 별도 SEO 필드를 채우지 않아도 카톡·문자 공유가 깨지지 않게 하는 목적.
 */
async function deriveFromLanding(campaign: Campaign): Promise<{
  title: string;
  description: string;
  image?: string;
}> {
  let content: Block[] = [];
  try {
    const data = await getCampaignPageData(campaign.id, "landing", "a");
    content = (data.content ?? []) as Block[];
  } catch {
    /* 기본값으로 폴백 */
  }

  const hero = content.find((b) => b.type === "Hero")?.props;
  const heading = content.find((b) => b.type === "Heading")?.props;
  const text = content.find((b) => b.type === "Text")?.props;
  const imgBlock = content.find(
    (b) => b.type === "Image" && clean(b.props?.image, 500),
  )?.props;

  const title =
    clean(hero?.title, 60) || clean(heading?.text, 60) || campaign.name;
  const description =
    clean(hero?.subtitle) || clean(text?.text) || `${campaign.name} · 무료 신청`;
  const image =
    clean(hero?.image, 500) || clean(imgBlock?.image, 500) || undefined;

  return { title, description, image: image || undefined };
}

/**
 * 랜딩(신청) 페이지 메타데이터. 캠페인별 title/description/OG 이미지.
 */
export async function landingMetadata(campaign: Campaign): Promise<Metadata> {
  const origin = siteOrigin();
  const { title, description, image } = await deriveFromLanding(campaign);
  const path = campaign.isDefault ? "/" : `/${campaign.slug}`;

  // Puck Hero 이미지가 없으면 브랜딩된 폴백 OG 이미지를 생성
  const ogUrl =
    image ||
    `${origin}/api/og?t=${encodeURIComponent(title)}&n=${encodeURIComponent(
      campaign.name,
    )}`;
  const ogImage = [{ url: ogUrl, width: 1200, height: 630 }];

  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: campaign.name,
      title,
      description,
      images: ogImage,
      locale: "ko_KR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

