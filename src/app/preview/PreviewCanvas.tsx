"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Def = { id: string; label: string; url: string; w: number; h: number };
type Screen = Def & { group: "user" | "admin"; x: number; y: number };

const GAP_X = 90;
const USER_H = 844;
const ADMIN_H = 860;
const ROW1_Y = 120;

function userDefs(basePath: string): Def[] {
  return [
    { id: "u1", label: "2단계 · 랜딩(신청)", url: `${basePath || "/"}?preview=1`, w: 390, h: USER_H },
    { id: "u2", label: "3단계 · 땡큐+저가상품", url: `${basePath}/thankyou?preview=1`, w: 390, h: USER_H },
    { id: "u3", label: "4단계 · VOD 시청", url: `${basePath}/vod?preview=1`, w: 390, h: USER_H },
    { id: "u4", label: "5단계 · 상담 예약", url: `${basePath}/booking?preview=1`, w: 390, h: USER_H },
  ];
}

function adminDefs(leadId: string | null): Def[] {
  return [
    { id: "a1", label: "대시보드", url: "/admin", w: 1180, h: ADMIN_H },
    { id: "a2", label: "캠페인", url: "/admin/campaigns", w: 1180, h: ADMIN_H },
    { id: "a3", label: "상품 관리", url: "/admin/products", w: 1180, h: ADMIN_H },
    { id: "a4", label: "CRM 고객 목록", url: "/admin/crm", w: 1180, h: ADMIN_H },
    {
      id: "a5",
      label: "CRM 고객 상세",
      url: leadId ? `/admin/crm/${leadId}` : "/admin/crm",
      w: 1180,
      h: ADMIN_H,
    },
    { id: "a6", label: "자동화", url: "/admin/automation", w: 1180, h: ADMIN_H },
    { id: "a7", label: "결제/주문 관리", url: "/admin/orders", w: 1180, h: ADMIN_H },
  ];
}

function layout(
  leadId: string | null,
  basePath: string,
): { screens: Screen[]; adminY: number } {
  const out: Screen[] = [];
  let x = 0;
  for (const s of userDefs(basePath)) {
    out.push({ ...s, group: "user", x, y: ROW1_Y });
    x += s.w + GAP_X;
  }
  const adminY = ROW1_Y + USER_H + 160;
  x = 0;
  let y = adminY;
  let rowMax = 0;
  adminDefs(leadId).forEach((s, i) => {
    if (i > 0 && i % 3 === 0) {
      x = 0;
      y += rowMax + 90;
      rowMax = 0;
    }
    out.push({ ...s, group: "admin", x, y });
    x += s.w + GAP_X;
    rowMax = Math.max(rowMax, s.h);
  });
  return { screens: out, adminY };
}

export function PreviewCanvas({
  leadId,
  basePath,
  campaignSlug,
  campaigns,
}: {
  leadId: string | null;
  basePath: string;
  campaignSlug: string;
  campaigns: { slug: string; name: string }[];
}) {
  const { screens, adminY } = layout(leadId, basePath);
  const [zoom, setZoom] = useState(0.42);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [nonce, setNonce] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setZoom((z) => Math.min(1.5, Math.max(0.15, z - e.deltaY * 0.002)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  useEffect(() => {
    const el = document.getElementById("pv-canvas");
    if (!el) return;
    const h = (e: Event) => {
      if ((e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey)
        e.preventDefault();
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100">
      <header className="z-10 flex items-center gap-3 border-b bg-white px-4 py-2 text-sm">
        <strong>화면 오버뷰</strong>
        <select
          value={campaignSlug}
          onChange={(e) => {
            window.location.search = e.target.value
              ? `?campaign=${e.target.value}`
              : "";
          }}
          className="rounded border px-2 py-1"
        >
          {campaigns.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-zinc-400">개발 전용 · Cmd/Ctrl+휠 확대</span>
        {!leadId && (
          <span className="text-amber-600">seed 없음 → CRM 상세는 목록으로</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded border px-2 py-1" onClick={() => setZoom((z) => Math.max(0.15, z - 0.08))}>−</button>
          <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="rounded border px-2 py-1" onClick={() => setZoom((z) => Math.min(1.5, z + 0.08))}>+</button>
          <button className="rounded border px-2 py-1" onClick={() => { setZoom(0.42); setPan({ x: 60, y: 40 }); }}>리셋</button>
          <button className="rounded border px-2 py-1" onClick={() => setNonce((n) => n + 1)}>새로고침</button>
        </div>
      </header>

      <div
        id="pv-canvas"
        className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.id === "pv-canvas" || t.id === "pv-world")
            drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (drag.current)
            setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        style={{
          backgroundImage: "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div
          id="pv-world"
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
        >
          <GroupLabel x={0} y={ROW1_Y - 46} text="사용자 페이지" />
          <GroupLabel x={0} y={adminY - 46} text="관리자 페이지" />
          {screens.map((s) => (
            <Frame key={s.id} s={s} nonce={nonce} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <div
      className="absolute whitespace-nowrap text-3xl font-bold text-zinc-400"
      style={{ left: x, top: y }}
    >
      {text}
    </div>
  );
}

function Frame({ s, nonce }: { s: Screen; nonce: number }) {
  return (
    <div className="absolute" style={{ left: s.x, top: s.y }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-sm font-semibold text-white">
          {s.label}
        </span>
        <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
          {s.url}
        </a>
      </div>
      <div
        className="overflow-hidden rounded-xl border-4 border-zinc-800 bg-white shadow-xl"
        style={{ width: s.w, height: s.h }}
      >
        <iframe key={nonce} src={s.url} className="h-full w-full" style={{ border: 0 }} />
      </div>
    </div>
  );
}
