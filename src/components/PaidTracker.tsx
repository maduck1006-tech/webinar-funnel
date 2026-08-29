"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/track";

/**
 * 결제 서비스가 ?paid=1 로 리다이렉트해 돌아왔을 때 광고 픽셀 Purchase 이벤트 1회 발화.
 * (Meta/GA 픽셀이 설정된 경우에만 동작 — 서버 DB 기록은 하지 않음)
 */
export function PaidTracker({
  leadId,
  value,
}: {
  leadId?: string;
  value?: number;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      trackOnce(`purchase:${leadId ?? "anon"}`, "purchase", {
        value: value ?? undefined,
        currency: "KRW",
      });
    }, 700);
    return () => clearTimeout(t);
  }, [leadId, value]);
  return null;
}
