import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * 공유 미리보기용 OG 이미지 폴백 (1200×630).
 * 랜딩 Puck 에 Hero 이미지가 없을 때 lib/page-meta.ts 가 이 URL 을 og:image 로 씀.
 * ?t=제목 &n=브랜드/캠페인명
 */
export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("t") || "무료 강의").slice(0, 80);
  const name = (searchParams.get("n") || "").slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(1000px 600px at 15% 0%, #2a0d0a 0%, #0b0b0d 55%)",
          color: "#f5f5f6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: "#ff3d2e",
            }}
          />
          <span style={{ fontSize: 28, color: "#a3a3ad", fontWeight: 600 }}>
            {name || "무료 강의"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 40 ? 60 : 76,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#a3a3ad" }}>
          신청 즉시 시청 · 48시간 무제한
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
