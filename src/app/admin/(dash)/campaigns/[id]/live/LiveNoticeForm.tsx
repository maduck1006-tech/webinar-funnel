"use client";

import { useActionState, useRef, useState } from "react";
import { SubmitButton } from "../../../form-ui";
import { PhoneBubble } from "../../../automation/_ui";
import { sendNotice } from "./actions";

export type EventOpt = {
  id: string;
  label: string;
  liveUrl: string;
  registered: number;
  notified: number;
  attended: number;
  rsvp: number;
};

type Kind = "rsvp" | "soon" | "start" | "nudge";

/**
 * 브런슨식: 라이브는 "한 번 알려주면 오는" 게 아니라 시퀀스로 채운다.
 * 각 시점은 '언제' 보내는지 + '무엇을 미끼로' 거는지가 정해져 있다.
 */
const MOMENTS: {
  v: Kind;
  when: string;
  label: string;
  gist: string;
  target: string;
  sample: string;
}[] = [
  {
    v: "rsvp",
    when: "D-2",
    label: "자리 잡기",
    gist: "올 사람을 미리 손들게 → 참석률의 절반은 여기서 갈림",
    target: "전체",
    sample:
      "{이름}님, 이번 라이브 자리 확인차 연락드려요.\n\n{일시}에 진행되고, 딱 한 가지 — [여기에 핵심 약속 한 줄] — 를 풀어드릴 거예요.\n\n오실 수 있으면 아래를 눌러 자리를 잡아두세요. 링크는 시작 전에 다시 보내드려요.",
  },
  {
    v: "soon",
    when: "D-1 ~ 1시간 전",
    label: "곧 시작",
    gist: "빅 도미노 한 문장으로 기대감 + 다시보기 마감으로 압박",
    target: "전체",
    sample:
      "{이름}님, {일시} 라이브가 곧 시작돼요.\n\n오늘 딱 하나 — [빅 도미노 한 문장] — 만 가져가시면 나머지는 따라옵니다.\n\n못 오시면 다시보기는 48시간만 열려요. 아래에서 바로 확인하세요.",
  },
  {
    v: "start",
    when: "시작 직후",
    label: "지금 LIVE",
    gist: "앞부분 놓치면 손해 — 지금 들어오게",
    target: "전체",
    sample:
      "{이름}님, 지금 시작했어요! 🔴\n\n[핵심 약속] 지금 라이브로 풀고 있습니다. 앞부분이 제일 중요해요. 바로 들어오세요.",
  },
  {
    v: "nudge",
    when: "시작 15분 후",
    label: "놓친 분께",
    gist: "아직 안 들어온 사람만 콕 집어서 — 참석률을 끌어올리는 마지막 카드",
    target: "미입장자만",
    sample:
      "{이름}님, 아직 안 들어오셨네요.\n\n방금 [핵심 포인트] 설명이 끝났고, 지금부터가 진짜예요. 10분이라도 보세요. 다시보기는 안 남을 수도 있어요.",
  },
];

const input =
  "w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-blue-500";

export function LiveNoticeForm({
  campaignId,
  events,
  siteOrigin,
}: {
  campaignId: string;
  events: EventOpt[];
  siteOrigin: string;
}) {
  const [state, formAction] = useActionState(sendNotice, null);

  const [kind, setKind] = useState<Kind>("rsvp");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [liveUrl, setLiveUrl] = useState(events[0]?.liveUrl ?? "");
  const [body, setBody] = useState(MOMENTS[0].sample);
  const [toTest, setToTest] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const bodyTouched = useRef(false);

  const ev = events.find((e) => e.id === eventId);
  const moment = MOMENTS.find((m) => m.v === kind)!;
  const isRsvp = kind === "rsvp";
  const onlyUnattended = kind === "nudge";

  function pickKind(k: Kind) {
    setKind(k);
    // 사용자가 문구를 안 건드렸으면 그 시점의 대본으로 교체
    if (!bodyTouched.current) setBody(MOMENTS.find((m) => m.v === k)!.sample);
  }
  function pickEvent(id: string) {
    setEventId(id);
    const e = events.find((x) => x.id === id);
    if (e) setLiveUrl(e.liveUrl);
  }

  const showRate =
    ev && ev.registered > 0
      ? Math.round((ev.attended / ev.registered) * 100)
      : 0;
  const rateTone =
    showRate >= 30 ? "#1d6537" : showRate >= 15 ? "#9a6a15" : "#9c1f21";

  const targetCount = toTest
    ? 1
    : onlyUnattended
      ? Math.max(0, (ev?.registered ?? 0) - (ev?.attended ?? 0))
      : (ev?.registered ?? 0);

  const previewText =
    body.replace(/\{이름\}/g, "홍길동").replace(/\{일시\}/g, "3/15 (금) 저녁 7:30").trim() +
    `\n\n${siteOrigin}/live/a1b2c3${isRsvp ? "?rsvp=1" : ""}`;

  return (
    <>
      {/* ── 참석률 스코어보드 ── */}
      {ev && (
        <div className="mb-5 grid gap-px overflow-hidden rounded-xl border bg-zinc-200 sm:grid-cols-4">
          {[
            { k: "등록", v: ev.registered },
            { k: "자리 잡음", v: ev.rsvp },
            { k: "실제 참석", v: ev.attended },
          ].map((s) => (
            <div key={s.k} className="bg-white p-3">
              <p className="text-[11px] font-medium text-zinc-400">{s.k}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900">
                {s.v}
              </p>
            </div>
          ))}
          <div className="bg-white p-3">
            <p className="text-[11px] font-medium text-zinc-400">참석률</p>
            <p
              className="mt-0.5 text-2xl font-bold tabular-nums"
              style={{ color: rateTone }}
            >
              {showRate}%
            </p>
            <p className="text-[10px] text-zinc-400">목표 30%+</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (dryRun || toTest) return;
            if (
              !window.confirm(
                `${targetCount}명에게 실제로 문자를 보냅니다.\n되돌릴 수 없습니다. 보낼까요?`,
              )
            ) {
              e.preventDefault();
            }
          }}
          className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm"
        >
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="eventId" value={eventId} />
          <input
            type="hidden"
            name="recipients"
            value={toTest ? "test" : "all"}
          />

          {/* 회차 */}
          <label className="block">
            <span className="text-xs font-bold text-zinc-600">회차</span>
            <select
              value={eventId}
              onChange={(e) => pickEvent(e.target.value)}
              className={`mt-1.5 ${input}`}
            >
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} · 등록 {e.registered}명
                </option>
              ))}
            </select>
          </label>

          {/* ── 시퀀스 (브런슨: 한 번이 아니라 흐름) ── */}
          <div>
            <p className="mb-2 text-xs font-bold text-zinc-600">
              언제 보내는 문자인가요?
            </p>
            <div className="space-y-1.5">
              {MOMENTS.map((m, i) => {
                const on = kind === m.v;
                return (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => pickKind(m.v)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      on ? "pick-on" : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <span className="mt-0.5 flex h-6 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-500">
                      {m.when}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-zinc-900">
                          {i + 1}. {m.label}
                        </span>
                        {m.target === "미입장자만" && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            미입장자만
                          </span>
                        )}
                        {on && (
                          <span
                            className="ml-auto text-xs font-bold"
                            style={{ color: "var(--fn-accent, #2563eb)" }}
                          >
                            ✓
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-zinc-500">
                        {m.gist}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 라이브 링크 */}
          <label className="block">
            <span className="text-xs font-bold text-zinc-600">
              라이브 링크 (유튜브 · 줌)
            </span>
            <input
              name="liveUrl"
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="https://youtube.com/... 또는 https://zoom.us/..."
              className={`mt-1.5 ${input}`}
            />
            <span className="mt-1 block text-[12px] text-zinc-400">
              손님은 개인 추적 주소를 거쳐 여기로 들어옵니다. 저장하면 회차
              링크로도 반영돼요.
            </span>
          </label>

          {/* 문구 */}
          <label className="block">
            <span className="text-xs font-bold text-zinc-600">문구</span>
            <textarea
              name="body"
              rows={6}
              value={body}
              onChange={(e) => {
                bodyTouched.current = true;
                setBody(e.target.value);
              }}
              className={`mt-1.5 ${input} leading-relaxed`}
            />
            <span className="mt-1 block text-[12px] leading-relaxed text-zinc-400">
              대괄호 <code>[ ]</code> 부분은 <b>이번 웨비나에서 풀어줄 &lsquo;딱
              하나&rsquo;</b>로 바꿔주세요. 막연한 &ldquo;유익한 시간&rdquo;보다
              구체적인 약속 하나가 참석률을 올립니다.{" "}
              <code>{"{이름}"}</code> · <code>{"{일시}"}</code> 는 자동으로
              채워지고, 링크는 맨 아래 붙습니다.
            </span>
          </label>

          {/* 받는 사람 */}
          <div>
            <p className="mb-2 text-xs font-bold text-zinc-600">받는 사람</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setToTest(false)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  toTest
                    ? "border-zinc-200 text-zinc-500"
                    : "pick-on text-zinc-900"
                }`}
              >
                {onlyUnattended
                  ? `아직 안 들어온 ${targetCount}명`
                  : `등록자 전체 (${ev?.registered ?? 0}명)`}
              </button>
              <button
                type="button"
                onClick={() => setToTest(true)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  toTest
                    ? "pick-on text-zinc-900"
                    : "border-zinc-200 text-zinc-500"
                }`}
              >
                나에게 테스트
              </button>
            </div>
            {toTest && (
              <input
                name="testPhone"
                inputMode="numeric"
                placeholder="01012345678"
                className={`mt-2 ${input}`}
              />
            )}
          </div>

          <label className="block">
            <span className="text-xs font-bold text-zinc-600">메모 (선택)</span>
            <input
              name="memo"
              placeholder="예: 3/15 1회차"
              className={`mt-1.5 ${input}`}
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-dashed p-3">
            <input
              type="checkbox"
              name="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold text-zinc-900">
                실제로 보내지 않기 (검증용)
              </span>
              <span className="mt-0.5 block text-[12px] text-zinc-500">
                받을 사람이 몇 명인지만 확인하고 문자는 나가지 않습니다.
              </span>
            </span>
          </label>

          {state?.error && (
            <p className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-[12.5px] text-red-700">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-[12.5px] text-emerald-800">
              ✓ {state.ok}
            </p>
          )}

          <SubmitButton
            className="w-full rounded-xl bg-black py-3 text-sm font-bold text-white"
            pendingLabel="보내는 중…"
          >
            {dryRun
              ? "검증만 실행"
              : toTest
                ? "나에게 테스트 보내기"
                : `${moment.label} 문자 · ${targetCount}명에게 보내기`}
          </SubmitButton>
        </form>

        {/* ── 미리보기 ── */}
        <div className="h-fit space-y-3">
          <p className="text-xs font-bold text-zinc-600">받는 사람 화면</p>
          <PhoneBubble text={previewText} />
          <p className="text-[12px] leading-relaxed text-zinc-500">
            맨 아래 주소는 <b>사람마다 다릅니다.</b> 누르면{" "}
            {isRsvp ? "참석 접수로" : "참석으로"} 기록한 뒤{" "}
            {isRsvp ? "확인 화면을," : "라이브로 넘겨줍니다."}{" "}
            그래서 위 <b>참석률</b>이 실제 클릭 기준으로 채워집니다.
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-700">
            지금은 <b>문자</b>로 나갑니다. 카카오 채널이 준비되면 이 화면은 그대로
            두고 통로만 알림톡으로 바뀝니다.
          </p>
        </div>
      </div>
    </>
  );
}
