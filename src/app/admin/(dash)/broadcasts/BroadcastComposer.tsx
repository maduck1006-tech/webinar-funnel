"use client";

import { useRef, useState } from "react";
import { createBroadcast } from "./actions";

type Opt = { id: string; name: string };

const VARS =
  "{이름} {링크} {예약링크} {결제링크} {단톡방링크} {세일즈링크} {강의실링크} {다운로드링크} {라이브러리링크} {상품명} {마감시각}";

export function BroadcastComposer({
  campaigns,
  products,
  initialCount,
}: {
  campaigns: Opt[];
  products: Opt[];
  initialCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState<number | null>(initialCount);
  const [loading, setLoading] = useState(false);
  const [when, setWhen] = useState<"now" | "schedule">("now");

  async function refresh() {
    const fd = new FormData(formRef.current!);
    const seg: Record<string, string> = {};
    for (const k of [
      "campaignId",
      "watched",
      "purchased",
      "booked",
      "productId",
      "productMode",
      "signupFrom",
      "signupTo",
    ]) {
      const val = String(fd.get(k) ?? "");
      if (val) seg[k] = val;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/broadcasts/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: seg.campaignId || undefined,
          watched: seg.watched || undefined,
          purchased: seg.purchased || undefined,
          booked: seg.booked || undefined,
          productId: seg.productId || undefined,
          productExclude: seg.productMode === "exclude",
          signupFrom: seg.signupFrom || undefined,
          signupTo: seg.signupTo || undefined,
        }),
      });
      const d = (await res.json()) as { count: number };
      setCount(d.count);
    } catch {
      setCount(null);
    }
    setLoading(false);
  }

  const sel =
    "mt-1 w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm";

  return (
    <form
      ref={formRef}
      action={createBroadcast}
      onChange={refresh}
      className="space-y-4 text-sm"
    >
      <label className="block">
        <span className="text-xs font-semibold text-zinc-600">이름 (관리용)</span>
        <input
          name="name"
          placeholder="예: 3월 신규 강의 안내"
          className={sel}
        />
      </label>

      <div className="rounded-lg border border-zinc-200 p-3">
        <p className="mb-2 text-xs font-bold text-zinc-600">누구에게</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] text-zinc-400">캠페인</span>
            <select name="campaignId" className={sel}>
              <option value="">전체 캠페인</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">시청</span>
            <select name="watched" className={sel}>
              <option value="">상관없음</option>
              <option value="yes">시청함</option>
              <option value="no">시청 안 함</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">구매</span>
            <select name="purchased" className={sel}>
              <option value="">상관없음</option>
              <option value="yes">구매함</option>
              <option value="no">구매 안 함</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">상담 예약</span>
            <select name="booked" className={sel}>
              <option value="">상관없음</option>
              <option value="yes">예약함</option>
              <option value="no">예약 안 함</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">특정 상품</span>
            <select name="productId" className={sel}>
              <option value="">사용 안 함</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">상품 조건</span>
            <select name="productMode" className={sel}>
              <option value="own">이 상품 구매자</option>
              <option value="exclude">이 상품 미구매자</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">신청일 (부터)</span>
            <input type="date" name="signupFrom" className={sel} />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-400">신청일 (까지)</span>
            <input type="date" name="signupTo" className={sel} />
          </label>
        </div>
        <p className="mt-2 text-sm font-bold">
          대상:{" "}
          {loading ? (
            <span className="text-zinc-400">계산 중…</span>
          ) : (
            <span className="text-blue-600">{count ?? "-"}명</span>
          )}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-zinc-600">문자 내용</span>
        <textarea
          name="body"
          required
          rows={5}
          placeholder="{이름}님, 이번 주 새 강의를 열었어요! ..."
          className={`${sel} font-normal leading-relaxed`}
        />
        <span className="mt-1 block text-[11px] text-zinc-400">
          {"{ }"} 안은 자동 치환 · {VARS}
        </span>
      </label>

      <div className="rounded-lg border border-zinc-200 p-3">
        <p className="mb-2 text-xs font-bold text-zinc-600">언제</p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="_when"
              checked={when === "now"}
              onChange={() => setWhen("now")}
            />
            지금 보내기
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="_when"
              checked={when === "schedule"}
              onChange={() => setWhen("schedule")}
            />
            예약
          </label>
        </div>
        {when === "schedule" && (
          <input
            type="datetime-local"
            name="scheduledAt"
            className={`${sel} mt-2 max-w-xs`}
          />
        )}
        <p className="mt-2 text-[11px] text-zinc-400">
          야간(자정~08시)에 걸리면 다음 날 아침 8시로 자동 예약됩니다.
        </p>
      </div>

      <button
        className="w-full rounded-lg bg-black py-2.5 font-semibold text-white"
        onClick={(e) => {
          if (
            when === "now" &&
            !confirm(`${count ?? 0}명에게 지금 문자를 발송합니다. 계속할까요?`)
          ) {
            e.preventDefault();
          }
        }}
      >
        {when === "now" ? `${count ?? 0}명에게 발송` : "예약하기"}
      </button>
    </form>
  );
}
