"use client";

import { useEffect, useRef, useState } from "react";
import {
  BOARD_H,
  BOARD_MSG_W,
  BOARD_MSGS,
  BOARD_NOTES,
  BOARD_PAGES,
  BOARD_SEQ,
  BOARD_TIMER,
  BOARD_W,
  JOURNEY_STOPS,
  type JourneyStop,
} from "./meta";
import { MessageEditor } from "./MessageEditor";

export type ResolvedStop = {
  triggerKey: string;
  enabled: boolean;
  template: string;
  offsetHours: number | null;
  source: "campaign" | "global" | "default";
  missing: boolean;
  sent: number;
};

const PAGE_H = 96;
const TIMER_H = 44;

const STOP_BY_KEY = new Map(JOURNEY_STOPS.map((s) => [s.triggerKey, s]));

function kindClass(k: JourneyStop["kind"]) {
  return k === "urgent"
    ? "urgent"
    : k === "success"
      ? "success"
      : k === "admin"
        ? "admin"
        : "msg";
}

export function JourneyBoard({
  resolved,
  campaignId,
}: {
  resolved: ResolvedStop[];
  campaignId: string | null;
}) {
  const byKey = new Map(resolved.map((r) => [r.triggerKey, r]));
  const vpRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 12, y: 10, scale: 1 });
  const drag = useRef<{ on: boolean; sx: number; sy: number } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [fs, setFs] = useState(false);

  const fit = () => {
    const vp = vpRef.current;
    if (!vp) return;
    const scale = Math.max(
      0.5,
      Math.min(1.4, Math.min((vp.clientWidth - 24) / BOARD_W, (vp.clientHeight - 24) / BOARD_H)),
    );
    setView({ x: 12, y: 10, scale: Math.max(0.5, scale) });
  };

  // 처음에 폭 맞춤
  useEffect(() => {
    fit();
     
  }, []);

  // 전체화면 상태 추적 → 다시 맞춤
  useEffect(() => {
    const onFs = () => {
      const active = document.fullscreenElement === vpRef.current;
      setFs(active);
      requestAnimationFrame(fit);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
     
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      vpRef.current?.requestFullscreen?.();
    }
  }

  function clampView(v: { x: number; y: number; scale: number }) {
    const vp = vpRef.current;
    if (!vp) return v;
    const cw = BOARD_W * v.scale;
    const ch = BOARD_H * v.scale;
    return {
      scale: v.scale,
      x: Math.min(24, Math.max(vp.clientWidth - cw - 24, v.x)),
      y: Math.min(24, Math.max(vp.clientHeight - ch - 24, v.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("[data-msg]") || t.closest("[data-drawer]")) return;
    drag.current = { on: true, sx: e.clientX - view.x, sy: e.clientY - view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current?.on) return;
    setView((v) =>
      clampView({ ...v, x: e.clientX - drag.current!.sx, y: e.clientY - drag.current!.sy }),
    );
  }
  function onPointerUp() {
    drag.current = null;
  }
  function zoom(delta: number) {
    setView((v) => clampView({ ...v, scale: Math.max(0.5, Math.min(1.4, v.scale + delta)) }));
  }

  // 와이어 좌표 (정적)
  const endFrom = (id: string) => {
    if (id === "timer")
      return { x: BOARD_TIMER.x + BOARD_TIMER.w / 2, y: BOARD_TIMER.y + TIMER_H };
    const p = BOARD_PAGES.find((pg) => pg.id === id)!;
    return { x: p.x + p.w / 2, y: p.y + PAGE_H };
  };

  const openStop = openKey ? STOP_BY_KEY.get(openKey) : null;
  const openRes = openKey ? byKey.get(openKey) : null;

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-4 rounded-sm bg-teal-600" /> 페이지
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-4 rounded-sm bg-[var(--fn-accent,#ff3d2e)]" /> 자동 문자
        </span>
        <span className="ml-1">· 빈 곳을 끌어 이동, 문자 클릭 시 수정</span>
        <span className="ml-auto flex gap-1">
          <button
            onClick={() => zoom(-0.15)}
            className="h-6 w-7 rounded border bg-white text-sm"
          >
            –
          </button>
          <button
            onClick={() => zoom(0.15)}
            className="h-6 w-7 rounded border bg-white text-sm"
          >
            +
          </button>
          <button
            onClick={toggleFullscreen}
            className="h-6 rounded border bg-white px-2 text-xs font-medium"
          >
            {fs ? "↙ 닫기" : "⛶ 전체화면"}
          </button>
        </span>
      </div>

      <div
        ref={vpRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={toggleFullscreen}
        style={{ height: fs ? "100vh" : 520 }}
        className="relative cursor-grab touch-none overflow-hidden rounded-xl border bg-white bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:24px_24px] active:cursor-grabbing"
      >
        {fs && (
          <button
            onClick={toggleFullscreen}
            className="absolute right-3 top-3 z-10 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold shadow"
          >
            ↙ 전체화면 닫기 (Esc)
          </button>
        )}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: BOARD_W,
            height: BOARD_H,
            transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          }}
        >
          {/* lane rules */}
          <div className="absolute left-0 h-px w-full bg-zinc-300" style={{ top: 64 }} />
          <div className="absolute left-0 h-px w-full bg-zinc-300" style={{ top: 386 }} />
          <span
            className="absolute left-2 rounded-full bg-teal-50 px-2 py-1 text-[12px] font-extrabold text-teal-700"
            style={{ top: 74 }}
          >
            고객이 보는 페이지
          </span>
          <span
            className="absolute left-2 rounded-full bg-red-50 px-2 py-1 text-[12px] font-extrabold text-[var(--fn-accent,#ff3d2e)]"
            style={{ top: 396 }}
          >
            자동 발송 문자
          </span>

          {/* wires */}
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={BOARD_W}
            height={BOARD_H}
          >
            <defs>
              <marker
                id="jm-ah"
                viewBox="0 0 8 8"
                refX="6"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 z" fill="var(--fn-accent,#ff3d2e)" />
              </marker>
            </defs>
            {BOARD_SEQ.slice(0, -1).map((id, i) => {
              const a = BOARD_PAGES.find((p) => p.id === id)!;
              const b = BOARD_PAGES.find((p) => p.id === BOARD_SEQ[i + 1])!;
              const ay = a.y + PAGE_H / 2;
              return (
                <path
                  key={id}
                  d={`M${a.x + a.w} ${ay} L${b.x} ${ay}`}
                  fill="none"
                  stroke="#bbb"
                  strokeWidth={2}
                />
              );
            })}
            {BOARD_MSGS.map((m) => {
              const f = endFrom(m.from);
              const mx = m.x + BOARD_MSG_W / 2;
              const midY = (f.y + m.y) / 2;
              return (
                <path
                  key={m.triggerKey}
                  d={`M${f.x} ${f.y} C ${f.x} ${midY} ${mx} ${midY} ${mx} ${m.y - 4}`}
                  fill="none"
                  stroke="var(--fn-accent,#ff3d2e)"
                  strokeWidth={2}
                  strokeDasharray="2 5"
                  markerEnd="url(#jm-ah)"
                  opacity={0.8}
                />
              );
            })}
            {BOARD_NOTES.map((n, i) => {
              const f = endFrom(n.from);
              const nx = n.x + n.w / 2;
              const midY = (f.y + n.y) / 2;
              return (
                <path
                  key={i}
                  d={`M${f.x} ${f.y} C ${f.x} ${midY} ${nx} ${midY} ${nx} ${n.y - 4}`}
                  fill="none"
                  stroke="#bbb"
                  strokeWidth={2}
                  strokeDasharray="2 5"
                />
              );
            })}
          </svg>

          {/* pages */}
          {BOARD_PAGES.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-xl border border-t-[3px] border-t-teal-600 bg-white p-3 shadow-sm"
              style={{ left: p.x, top: p.y, width: p.w, minHeight: PAGE_H }}
            >
              <span className="font-mono text-[9.5px] font-semibold tracking-wider text-teal-700">
                {p.tag}
              </span>
              <h3 className="text-[13px] font-bold leading-tight">{p.title}</h3>
              {p.note && (
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{p.note}</p>
              )}
            </div>
          ))}

          {/* timer */}
          <div
            className="absolute rounded-full border border-dashed bg-white px-3 py-2 text-center text-[11px] font-bold text-zinc-500"
            style={{ left: BOARD_TIMER.x, top: BOARD_TIMER.y, width: BOARD_TIMER.w }}
          >
            ⏱ 마감 타이머 (48h)
          </div>

          {/* notes (외부 처리 구간) */}
          {BOARD_NOTES.map((n, i) => (
            <div
              key={i}
              className="absolute rounded-xl border border-dashed bg-zinc-50 p-3 text-[11px] leading-snug text-zinc-500"
              style={{ left: n.x, top: n.y, width: n.w }}
            >
              💬 {n.text}
            </div>
          ))}

          {/* messages */}
          {BOARD_MSGS.map((m) => {
            const stop = STOP_BY_KEY.get(m.triggerKey);
            const res = byKey.get(m.triggerKey);
            if (!stop) return null;
            const k = kindClass(stop.kind);
            const border =
              k === "urgent"
                ? "border-l-amber-500"
                : k === "success"
                  ? "border-l-green-600"
                  : k === "admin"
                    ? "border-l-zinc-400"
                    : "border-l-[var(--fn-accent,#ff3d2e)]";
            return (
              <button
                key={m.triggerKey}
                data-msg
                onClick={() => setOpenKey(m.triggerKey)}
                style={{ left: m.x, top: m.y, width: BOARD_MSG_W }}
                className={`absolute rounded-xl border border-l-[3px] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${border} ${
                  res?.missing ? "opacity-60" : ""
                }`}
              >
                <span
                  className={`absolute right-2.5 top-2.5 rounded-full border px-1.5 py-0.5 font-mono text-[8.5px] font-bold ${
                    res?.missing
                      ? "border-amber-500 text-amber-600"
                      : res?.enabled
                        ? "border-green-600 text-green-700"
                        : "border-zinc-400 text-zinc-400"
                  }`}
                >
                  {res?.missing ? "작업중" : res?.enabled ? "켜짐" : "꺼짐"}
                </span>
                <span className="font-mono text-[9.5px] font-semibold tracking-wider text-[var(--fn-accent,#ff3d2e)]">
                  문자
                </span>
                <h3 className="pr-10 text-[13px] font-bold leading-tight">
                  {stop.title}
                </h3>
                <span className="mt-1.5 inline-block rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--fn-accent,#ff3d2e)]">
                  {stop.when.split(" · ")[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* drawer — 전체화면에서도 동작하도록 뷰포트 안에 렌더 */}
        {openStop && (
          <>
            <button
              aria-label="닫기"
              data-drawer
              onClick={() => setOpenKey(null)}
              className="absolute inset-0 z-40 bg-black/25"
            />
            <aside
              data-drawer
              className="absolute right-0 top-0 z-50 flex h-full w-[min(440px,92vw)] flex-col border-l bg-white shadow-2xl"
            >
              <div className="flex items-start gap-2 border-b p-4">
                <div>
                  <h2 className="text-[15px] font-extrabold">{openStop.title}</h2>
                  <p className="text-[12px] text-zinc-500">
                    {openStop.when} · {openStop.why}
                  </p>
                </div>
                <button
                  onClick={() => setOpenKey(null)}
                  className="ml-auto text-xl leading-none text-zinc-400"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                <p className="mb-3 text-[12px] text-zinc-500">
                  <b className="text-zinc-800">누구에게</b> · {openStop.situation}
                </p>
                {openRes && (
                  <MessageEditor
                    stop={openStop}
                    campaignId={campaignId}
                    enabled={openRes.enabled}
                    template={openRes.template}
                    offsetHours={openRes.offsetHours}
                    source={openRes.source}
                    missing={openRes.missing}
                    sent={openRes.sent}
                  />
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
