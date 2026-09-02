"use client";

import { useEffect } from "react";

/**
 * 루트 레이아웃 자체가 터졌을 때의 최후 방어선. 자체 <html>/<body> 필요,
 * globals.css 도 보장 안 되므로 인라인 스타일만 사용.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0d",
          color: "#f5f5f6",
          fontFamily:
            "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 44 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>
            잠시 문제가 생겼어요
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#a3a3ad" }}>
            잠시 후 다시 시도해 주세요. 계속되면 신청하신 문자로 회신해 주세요.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "12px 20px",
              borderRadius: 12,
              border: "none",
              background: "#ff3d2e",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            다시 시도
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#6b6b76" }}>
              오류코드 {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
