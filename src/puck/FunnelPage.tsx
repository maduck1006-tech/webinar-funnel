import { Render } from "@puckeditor/core/rsc";
import type { Metadata } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import type { Campaign, PageType } from "@/db/schema";
import {
  campaignBasePath,
  getCampaignPageData,
  type Variant,
} from "@/lib/campaign";
import { CampaignTracking } from "@/components/CampaignTracking";
import { config } from "./config";
import { UrgencyBar } from "./blocks/UrgencyBar";

/**
 * 캠페인의 한 페이지를 렌더. 라우트(기본/[campaign])가 campaign 을 해석해 넘긴다.
 * metadata 로 basePath·캠페인 설정(영상/마감/결제URL 등)을 블록에 주입.
 */
export async function FunnelPage({
  campaign,
  pageType,
  variant = "a",
  metadata,
  children,
}: {
  campaign: Campaign;
  pageType: PageType;
  variant?: Variant;
  metadata?: Metadata;
  children?: React.ReactNode;
}) {
  const data = await getCampaignPageData(campaign.id, pageType, variant);
  const basePath = campaignBasePath(campaign);

  const rootProps = (data.root?.props ?? {}) as {
    theme?: "dark" | "light";
    topbarText?: string;
    topbarCtaLabel?: string;
    topbarCtaHref?: string;
    topbarDeadlineIso?: string;
    topbarRushSeconds?: number;
  };
  const light = rootProps.theme === "light";

  // 카운트다운: 캠페인 설정 우선, 없으면 페이지 root props (하위호환)
  let rushSeconds = 0;
  let deadlineIso = "";
  if (campaign.countdownMode === "evergreen") {
    rushSeconds = campaign.countdownRushSeconds ?? 0;
  } else if (campaign.countdownMode === "fixed" && campaign.countdownDeadline) {
    deadlineIso = campaign.countdownDeadline.toISOString();
  } else {
    rushSeconds = Number(rootProps.topbarRushSeconds) || 0;
    deadlineIso = rootProps.topbarDeadlineIso || "";
  }
  const showCountdown = rushSeconds > 0 || !!deadlineIso;
  const hasTopbar =
    !!rootProps.topbarText || !!rootProps.topbarCtaLabel || showCountdown;

  const mergedMetadata: Metadata = {
    basePath,
    campaignId: campaign.id,
    campaignSlug: campaign.slug,
    ...metadata,
  };

  return (
    <div
      className={`funnel-theme funnel-shell ${light ? "funnel-theme-light" : ""}`}
      style={{ ["--fn-pad" as string]: "20px" }}
    >
      <CampaignTracking
        pixelId={campaign.metaPixelId}
        ga4Id={campaign.ga4MeasurementId}
      />
      {hasTopbar && (
        <div className="fn-topbar">
          {showCountdown ? (
            <div className="px-3 py-2.5">
              <UrgencyBar
                text={rootProps.topbarText || "마감 임박"}
                ctaLabel={rootProps.topbarCtaLabel || ""}
                ctaHref={rootProps.topbarCtaHref || "#apply"}
                deadlineIso={deadlineIso}
                rushSeconds={rushSeconds}
              />
            </div>
          ) : (
            <div className="mx-auto flex max-w-[500px] items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
              <span className="font-semibold text-[var(--fn-ink)]">
                {rootProps.topbarText}
              </span>
              {rootProps.topbarCtaLabel && (
                <a
                  href={rootProps.topbarCtaHref || "#apply"}
                  className="shrink-0 rounded-full bg-[var(--fn-accent)] px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  {rootProps.topbarCtaLabel}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="fn-in">
        <Render config={config} data={data} metadata={mergedMetadata} />
      </div>

      {children && (
        <div className="mx-auto max-w-[500px] px-5">{children}</div>
      )}

      <footer className="mx-auto max-w-[500px] border-t border-[var(--fn-line)] px-5 py-6 text-center text-[11px] leading-relaxed text-[var(--fn-sub)]">
        입력하신 정보는 강의 안내 목적에만 사용되며 안전하게 보관됩니다.
      </footer>
    </div>
  );
}
