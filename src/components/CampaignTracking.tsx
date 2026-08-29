"use client";

import Script from "next/script";
import { useEffect } from "react";
import { track } from "@/lib/track";

/**
 * 캠페인별 Meta Pixel + GA4 스크립트 주입 + 진입 시 PageView.
 * ID 가 없으면 아무것도 렌더 안 함.
 */
export function CampaignTracking({
  pixelId,
  ga4Id,
}: {
  pixelId?: string | null;
  ga4Id?: string | null;
}) {
  useEffect(() => {
    // 스크립트 로드에 약간의 여유를 두고 PageView 발화
    const t = setTimeout(() => track("page_view"), 600);
    return () => clearTimeout(t);
  }, []);

  if (!pixelId && !ga4Id) return null;

  return (
    <>
      {pixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');`}
        </Script>
      )}
      {ga4Id && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${ga4Id}');`}
          </Script>
        </>
      )}
    </>
  );
}
