import type { Config } from "@puckeditor/core";

/**
 * 퍼널 빌더 블록 세트 — 국내 웨비나 랜딩 스타일 (다크/이미지 중심).
 * Hero / Image / Heading / Text / Bullets / CTAButton / Countdown / LeadForm / Price
 */
import { CountdownTimer } from "./blocks/CountdownTimer";
import { CtaLink } from "./blocks/CtaLink";
import { LeadForm } from "./blocks/LeadForm";
import { VodPlayer } from "./blocks/VodPlayer";
import { imageField } from "./fields/ImageField";

export type RootProps = {
  theme: "dark" | "light";
  topbarText: string;
  topbarCtaLabel: string;
  topbarCtaHref: string;
  /** 설정 시 상단 긴급성 바가 D-day + 남은시간 카운트다운으로 표시됨 (ISO 8601) */
  topbarDeadlineIso: string;
  /** >0 이면 방문 시점부터 남은시간이 빠르게 줄어드는 연출(초). 실제로는 마감 안 됨. deadlineIso 무시 */
  topbarRushSeconds: number;
};

export type FunnelProps = {
  Hero: {
    image: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    height: "tall" | "medium" | "short";
  };
  Image: { image: string; alt: string; fullBleed: boolean; ratio: "auto" | "square" | "wide" | "portrait" };
  Video: { src: string; poster: string };
  Heading: { text: string; level: 1 | 2 | 3; align: "left" | "center"; eyebrow: string };
  Text: { text: string; align: "left" | "center"; style: "body" | "lead" | "bubble" };
  Bullets: { title: string; items: { text: string }[] };
  CTAButton: { label: string; href: string; variant: "primary" | "ghost"; sub: string };
  Countdown: { deadlineIso: string; expiredText: string; label: string };
  LeadForm: { headline: string; submitLabel: string; nextPath: string; note: string; sticky: boolean };
  Price: { compareAt: number; price: number; note: string; badge: string };
};

const align = {
  type: "radio" as const,
  options: [
    { label: "왼쪽", value: "left" },
    { label: "가운데", value: "center" },
  ],
};

/** 내부 경로(/로 시작)면 캠페인 basePath 접두, 그 외(#·http·mailto)는 그대로 */
function withBase(href: string, basePath?: string) {
  if (!basePath) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return basePath + href;
  return href;
}

export const config: Config<FunnelProps, RootProps> = {
  root: {
    fields: {
      theme: {
        type: "radio",
        options: [
          { label: "다크", value: "dark" },
          { label: "라이트", value: "light" },
        ],
      },
      topbarText: { type: "text", label: "상단바 문구" },
      topbarCtaLabel: { type: "text", label: "상단바 버튼 텍스트" },
      topbarCtaHref: { type: "text", label: "상단바 버튼 링크" },
      topbarDeadlineIso: {
        type: "text",
        label: "상단바 카운트다운 마감 (ISO, 예: 2026-09-17T23:59:59+09:00)",
      },
      topbarRushSeconds: {
        type: "number",
        label: "긴급 연출 시간(초) · >0 이면 빠르게 감소 후 멈춤 (마감 안 됨)",
        min: 0,
      },
    },
    defaultProps: {
      theme: "dark",
      topbarText: "",
      topbarCtaLabel: "",
      topbarCtaHref: "#apply",
      topbarDeadlineIso: "",
      topbarRushSeconds: 0,
    },
    // 에디터 캔버스와 실제 페이지 모두에서 퍼널 테마 토큰/배경 적용.
    // min-height 를 강제하지 않아 짧은 페이지(예약)에서 하단 슬롯이 밀려나지 않음.
    render: ({ children, theme }) => (
      <div
        className={`funnel-theme ${theme === "light" ? "funnel-theme-light" : ""}`}
        style={{
          ["--fn-pad" as string]: "20px",
          background: "var(--fn-bg)",
          color: "var(--fn-ink)",
        }}
      >
        <div className="mx-auto w-full max-w-[500px] px-5 py-4">{children}</div>
      </div>
    ),
  },

  components: {
    Hero: {
      fields: {
        image: imageField,
        eyebrow: { type: "text" },
        title: { type: "textarea" },
        subtitle: { type: "textarea" },
        height: {
          type: "select",
          options: [
            { label: "크게", value: "tall" },
            { label: "보통", value: "medium" },
            { label: "작게", value: "short" },
          ],
        },
      },
      defaultProps: {
        image: "",
        eyebrow: "무료 웨비나",
        title: "제목을 입력하세요",
        subtitle: "",
        height: "tall",
      },
      render: ({ image, eyebrow, title, subtitle, height }) => {
        const h =
          height === "tall"
            ? "min-h-[70svh]"
            : height === "short"
              ? "min-h-[40svh]"
              : "min-h-[55svh]";
        return (
          <div
            className={`fn-bleed relative mb-6 flex ${h} flex-col justify-end overflow-hidden`}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-zinc-700 to-zinc-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--fn-bg)] via-[var(--fn-bg)]/40 to-transparent" />
            <div className="relative px-5 pb-8 pt-24 text-center">
              {eyebrow && (
                <span className="mb-3 inline-block rounded-full border border-[var(--fn-accent)] px-3 py-1 text-[11px] font-bold tracking-wide text-[var(--fn-accent)]">
                  {eyebrow}
                </span>
              )}
              <h1 className="text-[26px] font-extrabold leading-[1.28] tracking-[-0.01em] text-white whitespace-pre-line">
                {title}
              </h1>
              {subtitle && (
                <p className="mx-auto mt-3 max-w-[22rem] text-[14px] leading-relaxed text-white/70 whitespace-pre-line">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        );
      },
    },

    Image: {
      fields: {
        image: imageField,
        alt: { type: "text" },
        fullBleed: {
          type: "radio",
          options: [
            { label: "화면 꽉 채우기", value: true },
            { label: "여백 유지", value: false },
          ],
        },
        ratio: {
          type: "select",
          options: [
            { label: "원본 비율", value: "auto" },
            { label: "정사각", value: "square" },
            { label: "와이드 16:9", value: "wide" },
            { label: "세로 4:5", value: "portrait" },
          ],
        },
      },
      defaultProps: { image: "", alt: "", fullBleed: true, ratio: "auto" },
      render: ({ image, alt, fullBleed, ratio }) => {
        const r =
          ratio === "square"
            ? "aspect-square"
            : ratio === "wide"
              ? "aspect-video"
              : ratio === "portrait"
                ? "aspect-[4/5]"
                : "";
        const wrap = `my-5 overflow-hidden ${fullBleed ? "fn-bleed" : "rounded-2xl"}`;
        if (!image)
          return (
            <div
              className={`${wrap} grid h-52 place-items-center bg-[var(--fn-bg-2)] text-sm text-[var(--fn-sub)]`}
            >
              이미지 영역
            </div>
          );
        return (
          <div className={wrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={alt}
              className={`w-full object-cover ${r}`}
            />
          </div>
        );
      },
    },

    Video: {
      fields: {
        src: {
          type: "text",
          label: "영상 링크 (YouTube · Vimeo 공유 링크 또는 MP4 URL)",
        },
        poster: { type: "text", label: "포스터 이미지 URL (MP4일 때만 적용)" },
      },
      defaultProps: { src: "", poster: "" },
      render: ({ src, poster, puck }) => {
        const meta = puck?.metadata as { vodSrc?: string } | undefined;
        return <VodPlayer src={src || meta?.vodSrc || ""} poster={poster} />;
      },
    },

    Heading: {
      fields: {
        eyebrow: { type: "text" },
        text: { type: "textarea" },
        level: {
          type: "select",
          options: [
            { label: "H1 (가장 큼)", value: 1 },
            { label: "H2", value: 2 },
            { label: "H3", value: 3 },
          ],
        },
        align,
      },
      defaultProps: { eyebrow: "", text: "헤드라인", level: 2, align: "center" },
      render: ({ eyebrow, text, level, align }) => {
        const Tag = `h${level}` as "h2";
        const size =
          level === 1
            ? "text-[28px] leading-[1.25]"
            : level === 2
              ? "text-[22px] leading-snug"
              : "text-lg leading-snug";
        return (
          <div className={`mb-3 mt-8 ${align === "center" ? "text-center" : ""}`}>
            {eyebrow && (
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--fn-accent)]">
                {eyebrow}
              </p>
            )}
            <Tag
              className={`${size} font-extrabold tracking-[-0.01em] text-[var(--fn-ink)] whitespace-pre-line`}
            >
              {text}
            </Tag>
          </div>
        );
      },
    },

    Text: {
      fields: {
        text: { type: "textarea" },
        align,
        style: {
          type: "radio",
          options: [
            { label: "본문", value: "body" },
            { label: "강조", value: "lead" },
            { label: "말풍선", value: "bubble" },
          ],
        },
      },
      defaultProps: { text: "본문 텍스트", align: "center", style: "body" },
      render: ({ text, align, style }) => {
        if (style === "bubble")
          return (
            <p className="my-3 rounded-2xl rounded-tl-sm bg-[var(--fn-bg-2)] px-4 py-3 text-[14px] leading-relaxed text-[var(--fn-ink)] whitespace-pre-line">
              {text}
            </p>
          );
        return (
          <p
            className={`my-3 whitespace-pre-line ${
              style === "lead"
                ? "text-[17px] font-semibold text-[var(--fn-ink)]"
                : "text-[14px] text-[var(--fn-sub)]"
            } leading-[1.75] ${align === "center" ? "text-center" : ""}`}
          >
            {text}
          </p>
        );
      },
    },

    Bullets: {
      fields: {
        title: { type: "text" },
        items: {
          type: "array",
          arrayFields: { text: { type: "text" } },
          defaultItemProps: { text: "항목" },
          getItemSummary: (i) => i.text || "항목",
        },
      },
      defaultProps: {
        title: "이런 분이라면",
        items: [{ text: "첫 번째 항목" }, { text: "두 번째 항목" }],
      },
      render: ({ title, items }) => (
        <div className="my-6">
          {title && (
            <p className="mb-3 text-lg font-extrabold text-[var(--fn-ink)]">
              {title}
            </p>
          )}
          <ul className="space-y-2.5">
            {(items ?? []).map((it, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl bg-[var(--fn-bg-2)] px-4 py-3"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--fn-accent)] text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[14px] leading-relaxed text-[var(--fn-ink)]">
                  {it.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },

    CTAButton: {
      fields: {
        label: { type: "text" },
        sub: { type: "text" },
        href: {
          type: "text",
          // "{{checkout}}" 를 넣으면 상품관리의 래피드 결제 URL 로 자동 연결
        },
        variant: {
          type: "radio",
          options: [
            { label: "강조(주요)", value: "primary" },
            { label: "고스트(보조)", value: "ghost" },
          ],
        },
      },
      defaultProps: { label: "신청하기", sub: "", href: "#apply", variant: "primary" },
      render: ({ label, sub, href, variant, puck }) => {
        // 페이지에서 이미 lead 파라미터까지 붙인 최종 결제 URL 을 넘겨줌
        const meta = puck?.metadata as
          | { checkoutUrl?: string; basePath?: string }
          | undefined;
        const wantsCheckout =
          !href || href === "#" || href === "{{checkout}}" || href === "결제";
        const isCheckout = wantsCheckout && !!meta?.checkoutUrl;
        const resolved = wantsCheckout
          ? (meta?.checkoutUrl ?? "#")
          : withBase(href, meta?.basePath);
        return (
        <CtaLink
          href={resolved}
          isCheckout={isCheckout}
          className={`group my-3 flex flex-col items-center rounded-xl px-6 py-4 text-center font-bold transition active:scale-[0.99] ${
            variant === "primary"
              ? "bg-[var(--fn-accent)] text-white shadow-[0_12px_30px_-10px_var(--fn-accent)]"
              : "border border-[var(--fn-line)] bg-[var(--fn-bg-2)] text-[var(--fn-ink)]"
          }`}
        >
          <span className="text-[15px]">
            {label}
            {variant === "primary" && (
              <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-0.5">
                →
              </span>
            )}
          </span>
          {sub && (
            <span
              className={`mt-0.5 text-xs font-normal ${
                variant === "primary" ? "text-white/80" : "text-[var(--fn-sub)]"
              }`}
            >
              {sub}
            </span>
          )}
        </CtaLink>
        );
      },
    },

    Countdown: {
      fields: {
        label: { type: "text" },
        deadlineIso: { type: "text" },
        expiredText: { type: "text" },
      },
      defaultProps: {
        label: "시청 마감까지",
        deadlineIso: "",
        expiredText: "시청 기간이 종료되었습니다",
      },
      render: ({ label, deadlineIso, expiredText, puck }) => (
        <CountdownTimer
          label={label}
          deadlineIso={
            deadlineIso ||
            (puck?.metadata?.vodDeadlineIso as string | undefined) ||
            ""
          }
          expiredText={expiredText}
        />
      ),
    },

    LeadForm: {
      fields: {
        headline: { type: "text" },
        submitLabel: { type: "text" },
        note: { type: "text" },
        nextPath: { type: "text" },
        sticky: {
          type: "radio",
          options: [
            { label: "고정(스크롤 따라다님)", value: true },
            { label: "일반", value: false },
          ],
        },
      },
      defaultProps: {
        headline: "무료 신청",
        submitLabel: "무료 강의 신청하기",
        note: "10초면 신청 완료 · 스팸 없음",
        nextPath: "/thankyou",
        sticky: false,
      },
      render: ({ headline, submitLabel, note, nextPath, sticky, puck }) => {
        const meta = puck?.metadata as
          | { basePath?: string; campaignId?: string }
          | undefined;
        return (
          <div id="apply" className="scroll-mt-16">
            <LeadForm
              headline={headline}
              submitLabel={submitLabel}
              note={note}
              nextPath={withBase(nextPath, meta?.basePath)}
              sticky={sticky}
              campaignId={meta?.campaignId}
            />
          </div>
        );
      },
    },

    Price: {
      fields: {
        badge: { type: "text" },
        compareAt: { type: "number" },
        price: { type: "number" },
        note: { type: "text" },
      },
      defaultProps: {
        badge: "한정가",
        compareAt: 0,
        price: 0,
        note: "이 페이지에서만 제공되는 가격",
      },
      render: ({ badge, compareAt, price, note, puck }) => {
        const meta = puck?.metadata as
          | { price?: number; compareAt?: number }
          | undefined;
        // 0 이면 상품관리에서 온 값 사용 (자동 연동)
        const p = price || meta?.price || 0;
        const c = compareAt || meta?.compareAt || 0;
        const off = c > p && p > 0 ? Math.round((1 - p / c) * 100) : 0;
        return (
          <div className="my-5 rounded-2xl border border-[var(--fn-line)] bg-[var(--fn-bg-2)] p-5 text-center">
            {badge && (
              <span className="inline-block rounded-full bg-[var(--fn-accent)] px-2.5 py-1 text-[11px] font-bold text-white">
                {badge}
                {off > 0 && ` · ${off}% 할인`}
              </span>
            )}
            <div className="mt-2 flex items-baseline justify-center gap-2">
              {c > p && (
                <span className="text-sm text-[var(--fn-sub)] line-through">
                  {c.toLocaleString()}원
                </span>
              )}
              <span className="text-[30px] font-extrabold tracking-tight text-[var(--fn-ink)]">
                {p > 0 ? p.toLocaleString() : "가격 미설정"}
                {p > 0 && <span className="ml-0.5 text-base font-bold">원</span>}
              </span>
            </div>
            {note && <p className="mt-1 text-xs text-[var(--fn-sub)]">{note}</p>}
          </div>
        );
      },
    },
  },
};

export default config;
