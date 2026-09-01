import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * 자동 메시지 — 초보자용 시각/설명 헬퍼
 * ------------------------------------------------------------------ */

export const TRIGGER_META: Record<
  string,
  { label: string; verb: string; icon: string; hint: string }
> = {
  signup: {
    label: "무료 신청했을 때",
    verb: "무료 신청하면",
    icon: "📝",
    hint: "랜딩페이지에서 이름·연락처를 남긴 순간부터 시간을 잽니다.",
  },
  watch_start: {
    label: "강의를 보기 시작했을 때",
    verb: "강의를 처음 열면",
    icon: "▶️",
    hint: "VOD 페이지에 처음 들어온 순간부터 시간을 잽니다.",
  },
  purchase: {
    label: "결제했을 때",
    verb: "결제를 마치면",
    icon: "💳",
    hint: "워크북 등 상품 결제가 완료된 순간부터 시간을 잽니다.",
  },
  booking: {
    label: "상담을 예약했을 때",
    verb: "상담을 예약하면",
    icon: "📅",
    hint: "되는시간에서 상담 시간을 잡은 순간부터 시간을 잽니다.",
  },
  manual: {
    label: "내가 직접 넣었을 때",
    verb: "내가 고객 목록에서 직접 넣으면",
    icon: "✋",
    hint: "CRM 고객 상세 화면에서 '이 고객을 여기 넣기' 를 누른 순간부터.",
  },
};

export const AUDIENCE_META: Record<
  string,
  { label: string; short: string; example: string }
> = {
  all: {
    label: "이 자동 메시지에 들어온 모든 사람",
    short: "전원",
    example: "환영 인사, 안내처럼 누구나 받아야 하는 문자",
  },
  not_watched: {
    label: "아직 강의를 한 번도 안 본 사람만",
    short: "미시청자",
    example: "\"링크만 받고 안 여셨네요, 오늘 꼭 보세요\" 리마인더",
  },
  not_purchased: {
    label: "아직 아무것도 결제 안 한 사람만",
    short: "미결제자",
    example: "\"워크북 특가 오늘까지예요\" 결제 유도",
  },
  not_booked: {
    label: "아직 상담 예약을 안 한 사람만",
    short: "미예약자",
    example: "\"1:1 상담 자리 얼마 안 남았어요\" 예약 유도",
  },
};

export const STOP_META: {
  key: string;
  label: string;
  consequence: string;
}[] = [
  {
    key: "purchase",
    label: "결제하면",
    consequence: "이미 산 사람에게 '어서 사세요' 문자를 안 보냅니다",
  },
  {
    key: "booking",
    label: "상담을 예약하면",
    consequence: "예약 끝난 사람에게 '예약하세요' 문자를 안 보냅니다",
  },
  {
    key: "watch_start",
    label: "강의를 보기 시작하면",
    consequence: "이미 본 사람에게 '아직 안 보셨어요?' 문자를 안 보냅니다",
  },
];

/** 분 → "3일 뒤" / "즉시" 등 사람 말 */
export function humanDelay(min: number): string {
  if (min <= 0) return "즉시";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return (
    [d && `${d}일`, h && `${h}시간`, m && `${m}분`].filter(Boolean).join(" ") +
    " 뒤"
  );
}

/**
 * 한 문자의 규칙을 자연스러운 한 문장으로. ← 사장님이 요청한 "설명법"
 * 예: "손님이 무료 신청하면, 3일 뒤에, 그때까지 강의를 안 본 사람에게 이 문자를 보냅니다."
 */
export function plainSentence(
  trigger: string,
  delayMinutes: number,
  audience: string,
): string {
  const t = TRIGGER_META[trigger]?.verb ?? trigger;
  const when =
    delayMinutes <= 0 ? "곧바로" : `${humanDelay(delayMinutes).replace(" 뒤", " 뒤에")}`;
  const who =
    audience === "all"
      ? ""
      : `, 그때까지 ${
          audience === "not_watched"
            ? "강의를 한 번도 안 본"
            : audience === "not_purchased"
              ? "아무것도 결제 안 한"
              : "상담 예약을 안 한"
        } 사람에게만`;
  return `손님이 ${t}, ${when}${who} 이 문자를 보냅니다.`;
}

/** 자동 메시지 전체를 한 줄 요약 */
export function automationSummary(
  trigger: string,
  stepCount: number,
  stopOn: string[],
): string {
  const t = TRIGGER_META[trigger]?.verb ?? trigger;
  const count =
    stepCount === 0
      ? "문자를 아직 안 넣음"
      : stepCount === 1
        ? "문자 1통"
        : `문자 ${stepCount}통이 차례로`;
  const stop =
    stopOn.length > 0
      ? ` (${stopOn
          .map((s) => STOP_META.find((x) => x.key === s)?.label ?? s)
          .join(" · ")} 나머지는 멈춤)`
      : "";
  return `손님이 ${t} → ${count} 나갑니다${stop}`;
}

/* ---------- 미리보기용 샘플 값 ---------- */

export const SAMPLE_VARS: Record<string, string> = {
  이름: "김민수",
  링크: "https://…/vod",
  예약링크: "https://…/booking",
  결제링크: "https://…/checkout",
  단톡방링크: "https://open.kakao.com/…",
  다운로드링크: "https://…/download",
  상품명: "실전 워크북",
  마감시각: "9월 5일 오후 11시",
};

export function previewText(body: string): string {
  return body.replace(/\{([^}]+)\}/g, (_, k: string) => SAMPLE_VARS[k.trim()] ?? `{${k}}`);
}

/* ---------- 시각 컴포넌트 ---------- */

/** 문자 미리보기 — 카톡 말풍선 느낌 */
export function PhoneBubble({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-[#b2c7d9] p-3">
      <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-relaxed text-zinc-800 shadow-sm">
        <p className="whitespace-pre-wrap">{text || "(내용을 입력하세요)"}</p>
      </div>
      <p className="mt-1 pl-1 text-[10px] text-zinc-500/80">
        미리보기 · 실제 발송 시 변수는 손님 정보로 채워집니다
      </p>
    </div>
  );
}

/** 리스트 카드용 미니 타임라인 (문자 발송 시점 점) */
export function MiniTimeline({
  delays,
}: {
  delays: number[];
}) {
  if (delays.length === 0)
    return <span className="text-[11px] text-zinc-400">문자 없음</span>;
  const max = Math.max(...delays, 1);
  return (
    <div className="relative h-6 w-full max-w-[220px]">
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-zinc-200" />
      {delays.map((d, i) => {
        const pct = max === 0 ? 0 : (d / max) * 100;
        return (
          <div
            key={i}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.min(96, Math.max(2, pct))}%` }}
          >
            <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--fn-accent,#ff3d2e)] shadow" />
            <span className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[9px] text-zinc-400">
              {humanDelay(d).replace(" 뒤", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 즉시 제출되는 폼의 토글 스위치 (button — 누르면 바로 서버액션 실행) */
export function ToggleSwitch({ on, label }: { on: boolean; label?: ReactNode }) {
  return (
    <button
      className="inline-flex items-center gap-2"
      title={on ? "끄기" : "켜기"}
    >
      <span
        className={`relative inline-block h-5 w-9 rounded-full transition ${
          on ? "bg-green-500" : "bg-zinc-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      {label && <span className="text-xs text-zinc-500">{label}</span>}
    </button>
  );
}

/**
 * 다른 필드와 함께 저장되는(=즉시 제출 안 되는) 체크박스형 토글.
 * 진짜 <input type="checkbox"> 라 폼 값으로 같이 전송됨. CSS peer 로 스위치처럼 보이게.
 */
export function CheckboxToggle({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked: boolean;
  label?: ReactNode;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="relative inline-block h-5 w-9 rounded-full bg-zinc-300 transition peer-checked:bg-green-500">
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:left-[18px]" />
      </span>
      {label && <span className="text-xs text-zinc-500">{label}</span>}
    </label>
  );
}
