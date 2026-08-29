"use client";

/** P2에서 Mux Player 등으로 교체 가능. YouTube/Vimeo 링크는 iframe, 그 외는 <video>. */
export function VodPlayer({
  src,
  poster,
  editing,
}: {
  src: string;
  poster: string;
  editing?: boolean;
}) {
  const url = (src || process.env.NEXT_PUBLIC_VOD_SRC || "").trim();

  if (!url)
    // 영상 미설정: 편집 화면에서만 자리표시. 실제 페이지에선 렌더 안 함(깨진 검은 박스 방지).
    return editing ? (
      <div className="fn-bleed my-4 grid aspect-video place-items-center bg-black text-sm font-medium text-white/50">
        ▶ 강의 영상 (영상 링크를 입력하세요)
      </div>
    ) : null;

  const embed = toEmbedUrl(url);
  if (embed)
    return (
      <div className="fn-bleed my-4 aspect-video bg-black">
        <iframe
          className="h-full w-full"
          src={embed}
          title="강의 영상"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );

  return (
    <video
      className="fn-bleed my-4 aspect-video bg-black"
      src={url}
      poster={poster || undefined}
      controls
      controlsList="nodownload"
      playsInline
    />
  );
}

/** YouTube / Vimeo 공유 링크를 임베드 URL로 변환. 아니면 null. */
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");

  // 이미 임베드 URL이면 그대로
  if (
    (host === "youtube.com" && u.pathname.startsWith("/embed/")) ||
    (host === "player.vimeo.com" && u.pathname.startsWith("/video/"))
  ) {
    return raw;
  }

  // YouTube
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id =
      u.searchParams.get("v") ||
      (u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : "");
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  // Vimeo (vimeo.com/123456789 또는 vimeo.com/123/abc 형태)
  if (host === "vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts[0];
    const hash = parts[1];
    if (/^\d+$/.test(id ?? "")) {
      return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
    }
  }

  return null;
}
