"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/track";

/**
 * 오퍼가 있는 페이지 조회 시 ViewContent 1회 발화 (리타게팅 오디언스용).
 * 세일즈/땡큐/VOD 뷰에서 상품이 있을 때 렌더.
 */
export function OfferTracker({
  productName,
  price,
  where,
}: {
  productName?: string;
  price?: number;
  where: string;
}) {
  useEffect(() => {
    trackOnce(`vc:${where}:${productName ?? ""}`, "view_content", {
      content_name: productName,
      value: price || undefined,
      currency: "KRW",
    });
  }, [productName, price, where]);
  return null;
}
