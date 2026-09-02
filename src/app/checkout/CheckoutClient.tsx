"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk";
import { track, trackOnce } from "@/lib/track";
import { paymentErrorInfo } from "@/lib/payment-errors";
import {
  emailError,
  formatPhoneKR,
  hasErrors,
  nameError,
  phoneDigits,
  phoneError,
  validateLead,
} from "@/lib/form-validate";

/** 토스 SDK 에러 → 사용자용 문구 (raw 메시지/코드 노출 방지) */
function sdkErr(e: unknown): string | null {
  const code = (e as { code?: string })?.code;
  if (code && ["PAY_PROCESS_CANCELED", "PAY_PROCESS_ABORTED", "USER_CANCEL"].includes(code)) {
    return null; // 사용자가 스스로 취소 — 에러로 표시하지 않음
  }
  const info = paymentErrorInfo(code);
  return `${info.title} — ${info.detail}`;
}

type Lead = { id: string; name: string; email: string; phone: string };

export type CheckoutClientProps = {
  clientKey: string | null;
  product: {
    id: string;
    name: string;
    price: number;
    compareAt: number | null;
    description: string;
    imageUrl: string | null;
    kind: string;
    freeMonths: number;
    bundleNames?: string[];
  };
  bump: { name: string; price: number; description: string } | null;
  campaignId: string | null;
  lead: Lead | null;
  role?: "main" | "upsell" | "downsell";
  startStep: "contact" | "pay";
  successUrl: string;
  failUrl: string;
};

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/** 멤버십 프로모션 히어로 (0원 구독을 직관적으로 — 요기패스X 레퍼런스) */
function MembershipHero({
  name,
  price,
  compareAt,
  freeMonths,
  description,
}: {
  name: string;
  price: number;
  compareAt: number | null;
  freeMonths: number;
  description: string;
}) {
  const benefits = description
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-2xl p-5 text-white"
      style={{
        background:
          "radial-gradient(120% 90% at 15% 0%, color-mix(in srgb, var(--fn-accent) 85%, #fff) 0%, var(--fn-accent) 45%, color-mix(in srgb, var(--fn-accent) 55%, #000) 100%)",
      }}
    >
      {/* 광택 */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/20 blur-2xl" />

      <p className="relative text-[12px] font-bold tracking-wide text-white/85">
        ⏳ 지금 신청분 한정 · 이 화면에서만
      </p>

      <div className="relative mt-2">
        <p className="text-[15px] font-bold text-white/90">{name}</p>
        {freeMonths > 0 ? (
          <p className="mt-1 text-[34px] font-extrabold leading-none">
            첫 {freeMonths}개월{" "}
            <span className="text-white">0원</span>
          </p>
        ) : (
          <p className="mt-1 text-[34px] font-extrabold leading-none">
            매달 {won(price)}
          </p>
        )}
        <p className="mt-2 text-[12.5px] text-white/80">
          {freeMonths > 0
            ? `${freeMonths}개월 뒤부터 매달 ${won(price)} · 언제든 해지`
            : "언제든 해지 가능"}
          {compareAt && compareAt > price && (
            <span className="ml-1.5 text-white/55 line-through">
              {won(compareAt)}
            </span>
          )}
        </p>
      </div>

      {benefits.length > 0 && (
        <ul className="relative mt-3 space-y-1 border-t border-white/20 pt-3 text-[12.5px] text-white/90">
          {benefits.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span>✓</span>
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Widgets = Awaited<
  ReturnType<Awaited<ReturnType<typeof loadTossPayments>>["widgets"]>
>;

export function CheckoutClient(props: CheckoutClientProps) {
  const { clientKey, product, bump, campaignId, successUrl, failUrl } = props;
  const role = props.role ?? "main";
  const isMembership = product.kind === "membership";

  const [step, setStep] = useState<"contact" | "pay">(props.startStep);
  const [lead, setLead] = useState<Lead | null>(props.lead);
  const [withBump, setWithBumpRaw] = useState(false);
  const [coupon, setCoupon] = useState<{
    code: string;
    discount: number;
    label: string;
  } | null>(null);

  // 범프가 바뀌면 % 쿠폰 할인액이 달라지므로 쿠폰 초기화(재적용 유도)
  const setWithBump = (v: boolean) => {
    setWithBumpRaw(v);
    setCoupon(null);
  };

  const gross = product.price + (withBump && bump ? bump.price : 0);
  const amount = Math.max(0, gross - (coupon?.discount ?? 0));

  if (!clientKey) {
    return (
      <Shell>
        <p className="text-sm text-white/70">
          지금은 결제를 진행할 수 없어요. 잠시 후 다시 시도하시거나 신청하신
          문자로 문의해 주세요.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-wide text-[var(--fn-accent)]">
          {role !== "main"
            ? "추가 주문"
            : step === "contact"
              ? "1 / 2 · 정보 입력"
              : "2 / 2 · 결제"}
        </p>
        <h1 className="mt-1 text-lg font-bold text-white">
          {role !== "main" ? "결제 정보 입력" : "주문서"}
        </h1>
      </div>

      {/* 주문 요약 — 멤버십은 PayStep 안에서 프로모션 카드로 대체 */}
      {isMembership ? (
        <MembershipHero
          name={product.name}
          price={product.price}
          compareAt={product.compareAt}
          freeMonths={product.freeMonths}
          description={product.description}
        />
      ) : (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {product.name}
              </p>
              <p className="mt-0.5 text-sm text-white/60">
                {product.compareAt && product.compareAt > product.price && (
                  <span className="mr-1 line-through">
                    {won(product.compareAt)}
                  </span>
                )}
                <span className="font-bold text-white">
                  {won(product.price)}
                </span>
              </p>
              {product.bundleNames && product.bundleNames.length > 0 && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/50">
                  포함: {product.bundleNames.join(" · ")}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[13px]">
            {withBump && bump && (
              <div className="flex justify-between text-white/60">
                <span>{bump.name}</span>
                <span>+{won(bump.price)}</span>
              </div>
            )}
            {coupon && (
              <div className="flex justify-between text-emerald-300">
                <span>쿠폰 · {coupon.label}</span>
                <span>−{won(coupon.discount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-[15px] font-bold text-white">
              <span>결제 금액</span>
              <span>{won(amount)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            결제 즉시 이용 가능 · 콘텐츠 제공 전이라면 문자로 요청 시 전액 환불돼요.
          </p>
        </div>
      )}

      {step === "contact" ? (
        <ContactStep
          campaignId={campaignId}
          defaultValues={lead}
          onDone={(l) => {
            setLead(l);
            setStep("pay");
          }}
        />
      ) : (
        <PayStep
          clientKey={clientKey}
          productId={product.id}
          productKind={product.kind}
          freeMonths={product.freeMonths}
          role={role}
          lead={lead}
          bump={bump}
          withBump={withBump}
          setWithBump={setWithBump}
          gross={gross}
          coupon={coupon}
          setCoupon={setCoupon}
          amount={amount}
          successUrl={successUrl}
          failUrl={failUrl}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[460px] px-5 py-8">{children}</div>
  );
}

/* ---------- 1단계: 연락처 ---------- */

function ContactStep({
  campaignId,
  defaultValues,
  onDone,
}: {
  campaignId: string | null;
  defaultValues: Lead | null;
  onDone: (lead: Lead) => void;
}) {
  const [values, setValues] = useState({
    name: defaultValues?.name ?? "",
    email: defaultValues?.email ?? "",
    phone: defaultValues?.phone ? formatPhoneKR(defaultValues.phone) : "",
  });
  const [errs, setErrs] = useState<Record<FieldKey, string | null>>({
    name: null,
    email: null,
    phone: null,
  });
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false,
    email: false,
    phone: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = (k: FieldKey, raw: string) => {
    const v =
      k === "name" ? nameError(raw) : k === "email" ? emailError(raw) : phoneError(raw);
    setErrs((e) => ({ ...e, [k]: v }));
    return v;
  };
  const onChange = (k: FieldKey, raw: string) => {
    const v = k === "phone" ? formatPhoneKR(raw) : raw;
    setValues((s) => ({ ...s, [k]: v }));
    if (touched[k]) check(k, v);
  };
  const onBlur = (k: FieldKey) => {
    setTouched((t) => ({ ...t, [k]: true }));
    check(k, values[k]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);

    const fieldErrs = validateLead(values);
    setErrs(fieldErrs);
    setTouched({ name: true, email: true, phone: true });
    if (hasErrors(fieldErrs)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignId ?? undefined,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: phoneDigits(values.phone),
          landingUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = (await res.json()) as { leadId?: string; error?: string };
      if (!res.ok || !data.leadId) {
        setErr("정보 저장에 실패했어요. 입력값을 확인하고 다시 시도해 주세요.");
        setBusy(false);
        return;
      }
      onDone({
        id: data.leadId,
        name: values.name.trim(),
        email: values.email.trim(),
        phone: phoneDigits(values.phone),
      });
    } catch {
      setErr("네트워크 오류예요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2.5">
      <CoField
        k="name"
        placeholder="이름"
        autoComplete="name"
        value={values.name}
        error={touched.name ? errs.name : null}
        onChange={onChange}
        onBlur={onBlur}
      />
      <CoField
        k="email"
        placeholder="이메일"
        type="email"
        autoComplete="email"
        value={values.email}
        error={touched.email ? errs.email : null}
        onChange={onChange}
        onBlur={onBlur}
      />
      <CoField
        k="phone"
        placeholder="휴대폰 번호"
        type="tel"
        autoComplete="tel"
        value={values.phone}
        error={touched.phone ? errs.phone : null}
        onChange={onChange}
        onBlur={onBlur}
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-2 w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: "var(--fn-accent)" }}
      >
        {busy ? "저장 중…" : "다음 · 결제하기"}
      </button>
      <p className="pt-1 text-center text-[11px] leading-relaxed text-white/40">
        결제 후 이 번호로 시청·다운로드 링크가 문자로 전송돼요.
        <br />
        입력하신 정보는 주문 처리와 상품 안내에만 사용됩니다.
      </p>
    </form>
  );
}

type FieldKey = "name" | "email" | "phone";

function CoField({
  k,
  placeholder,
  type = "text",
  autoComplete,
  value,
  error,
  onChange,
  onBlur,
}: {
  k: FieldKey;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  value: string;
  error: string | null;
  onChange: (k: FieldKey, v: string) => void;
  onBlur: (k: FieldKey) => void;
}) {
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(k, e.target.value)}
        onBlur={() => onBlur(k)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "numeric" : undefined}
        aria-invalid={error ? "true" : undefined}
        className={`w-full rounded-xl border bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none ${
          error ? "border-red-400/70" : "border-white/15 focus:border-[var(--fn-accent)]"
        }`}
      />
      {error && <p className="mt-1 pl-1 text-[12px] text-red-400">{error}</p>}
    </div>
  );
}

/* ---------- 2단계: 결제 ---------- */

type CouponState = { code: string; discount: number; label: string } | null;

function PayStep({
  clientKey,
  productId,
  productKind,
  freeMonths,
  role,
  lead,
  bump,
  withBump,
  setWithBump,
  gross,
  coupon,
  setCoupon,
  amount,
  successUrl,
  failUrl,
}: {
  clientKey: string;
  productId: string;
  productKind: string;
  freeMonths: number;
  role: "main" | "upsell" | "downsell";
  lead: Lead | null;
  bump: { name: string; price: number; description: string } | null;
  withBump: boolean;
  setWithBump: (v: boolean) => void;
  gross: number;
  coupon: CouponState;
  setCoupon: (c: CouponState) => void;
  amount: number;
  successUrl: string;
  failUrl: string;
}) {
  const [widgetReady, setWidgetReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const widgetsRef = useRef<Widgets | null>(null);
  const startedRef = useRef(false);

  const isMembership = productKind === "membership";
  const ready = isMembership || widgetReady;

  // 결제창이 (팝업 차단 등으로) 안 뜨고 멈추는 경우 대비 — 25초 후 안내 + 버튼 복구
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSlowHint = () => {
    if (slowTimer.current) {
      clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  };
  const armSlowHint = () => {
    clearSlowHint();
    slowTimer.current = setTimeout(() => {
      setErr(
        "결제창이 뜨지 않으면 브라우저 팝업 차단을 해제하고 다시 시도해 주세요.",
      );
      setPaying(false);
    }, 25000);
  };
  useEffect(() => clearSlowHint, []);

  // 멤버십: 빌링 인증(카드 등록) → 리다이렉트. 정기결제는 크론이 청구.
  const payMembership = useCallback(async () => {
    if (paying || !lead?.id) return;
    setPaying(true);
    setErr(null);
    armSlowHint();
    try {
      const toss = await loadTossPayments(clientKey);
      const payment = toss.payment({ customerKey: lead.id });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl,
        failUrl,
        customerEmail: lead.email,
        customerName: lead.name || undefined,
      });
    } catch (e: unknown) {
      clearSlowHint();
      const m = sdkErr(e);
      if (m) setErr(m);
      setPaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paying, lead, clientKey, successUrl, failUrl]);

  // 주문서 도달 = AddToCart (리타게팅)
  useEffect(() => {
    trackOnce(`atc:${productId}`, "add_to_cart", {
      value: amount,
      currency: "KRW",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 위젯 초기화 (1회) — 멤버십은 위젯 대신 빌링 인증이라 스킵
  useEffect(() => {
    if (isMembership) return;
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const toss = await loadTossPayments(clientKey);
        const widgets = toss.widgets({ customerKey: lead?.id ?? ANONYMOUS });
        await widgets.setAmount({ currency: "KRW", value: amount });
        await widgets.renderPaymentMethods({ selector: "#toss-payment-method" });
        await widgets.renderAgreement({ selector: "#toss-agreement" });
        widgetsRef.current = widgets;
        setWidgetReady(true);
      } catch (e) {
        startedRef.current = false; // 실패 시 재시도 허용
        console.error("toss widget load failed", e);
        setErr(sdkErr({ code: "WIDGET_LOAD_FAILED" }));
      }
    })();
    // 최초 1회만. amount 변경은 아래 effect 가 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 범프 토글 → 금액 갱신
  useEffect(() => {
    if (widgetsRef.current) {
      widgetsRef.current
        .setAmount({ currency: "KRW", value: amount })
        .catch(() => {});
    }
  }, [amount]);

  const pay = useCallback(async () => {
    if (!widgetsRef.current || paying) return;
    setPaying(true);
    setErr(null);
    try {
      const res = await fetch("/api/toss/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          leadId: lead?.id ?? null,
          withBump: role === "main" && withBump && !!bump,
          role,
          couponCode: coupon?.code,
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        amount?: number;
        discount?: number;
        orderName?: string;
        error?: string;
      };
      // 서버 재검증 결과 할인이 미리보기와 다르면 쿠폰 상태 동기화
      if (coupon && (data.discount ?? 0) !== coupon.discount) {
        if (!data.discount) setCoupon(null);
        else setCoupon({ ...coupon, discount: data.discount });
      }
      if (!res.ok || !data.orderId) {
        setErr(data.error || "주문 생성에 실패했습니다.");
        setPaying(false);
        return;
      }
      track("checkout_start", {
        value: data.amount ?? amount,
        currency: "KRW",
      });
      await widgetsRef.current.setAmount({
        currency: "KRW",
        value: data.amount ?? amount,
      });
      armSlowHint();
      await widgetsRef.current.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName ?? "주문",
        successUrl,
        failUrl,
        customerEmail: lead?.email,
        customerName: lead?.name || undefined,
        customerMobilePhone: lead?.phone?.replace(/[^0-9]/g, "") || undefined,
      });
    } catch (e: unknown) {
      clearSlowHint();
      const m = sdkErr(e);
      if (m) setErr(m);
      setPaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paying,
    productId,
    role,
    lead,
    withBump,
    bump,
    coupon,
    setCoupon,
    amount,
    successUrl,
    failUrl,
  ]);

  if (isMembership) {
    return (
      <div>
        {err && (
          <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {err}
          </p>
        )}
        <button
          onClick={payMembership}
          disabled={paying || !lead?.id}
          className="w-full rounded-xl py-4 text-base font-bold text-white disabled:opacity-50"
          style={{ background: "var(--fn-accent)" }}
        >
          {paying
            ? "진행 중…"
            : freeMonths > 0
              ? "0원으로 시작하기"
              : "카드 등록하고 시작하기"}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/40">
          지금은 카드만 등록합니다.
          {freeMonths > 0
            ? ` 첫 결제는 ${freeMonths}개월 뒤이고, 그 전에 해지하면 요금이 청구되지 않아요.`
            : " 결제는 매달 자동 진행됩니다."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 오더 범프 — 클릭퍼널스식 (눈에 띄는 박스 + 화살표 + 1인칭 긍정 문구) */}
      {bump && (
        <div className="mb-4">
          <p className="mb-1 text-center text-[12px] font-bold text-amber-300">
            ▼ 이 주문에만 드리는 제안 ▼
          </p>
          <label
            className={`flex cursor-pointer gap-3 rounded-xl border-2 border-dashed p-3.5 transition ${
              withBump
                ? "border-amber-400 bg-amber-400/15"
                : "border-amber-400/70 bg-amber-400/8"
            }`}
          >
            <input
              type="checkbox"
              checked={withBump}
              onChange={(e) => setWithBump(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500"
            />
            <span className="text-[13px] leading-relaxed text-white/90">
              <b className="text-amber-200">
                네, {bump.name} 추가할게요!
              </b>
              <br />
              <span className="text-white/70">
                {bump.description || `지금 함께 담으면 딱 맞습니다.`}
              </span>
              <br />
              <span className="mt-1 inline-block text-white/60">
                +{won(bump.price)} · 이 화면에서만
              </span>
            </span>
          </label>
        </div>
      )}

      {/* 프로모션 코드 (본상품 결제에서만) */}
      {role === "main" && (
        <CouponField
          productId={productId}
          leadId={lead?.id ?? null}
          gross={gross}
          coupon={coupon}
          setCoupon={setCoupon}
        />
      )}

      {/* 토스 결제수단 위젯 (흰 배경) */}
      <div className="rounded-xl bg-white p-1">
        <div id="toss-payment-method" className="min-h-[220px]" />
        <div id="toss-agreement" />
      </div>

      {err && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {err}
        </p>
      )}

      <button
        onClick={pay}
        disabled={!ready || paying}
        className="mt-4 w-full rounded-xl py-4 text-base font-bold text-white disabled:opacity-50"
        style={{ background: "var(--fn-accent)" }}
      >
        {paying ? "결제 진행 중…" : `${won(amount)} 결제하기`}
      </button>
    </div>
  );
}

/* ---------- 프로모션 코드 ---------- */

function CouponField({
  productId,
  leadId,
  gross,
  coupon,
  setCoupon,
}: {
  productId: string;
  leadId: string | null;
  gross: number;
  coupon: CouponState;
  setCoupon: (c: CouponState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply() {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, productId, amount: gross, leadId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        discount?: number;
        label?: string;
      };
      if (!data.ok || !data.discount) {
        setErr(data.reason || "사용할 수 없는 쿠폰이에요.");
      } else {
        setCoupon({ code: c, discount: data.discount, label: data.label ?? "할인" });
        setCode("");
        setErr(null);
      }
    } catch {
      setErr("잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  if (coupon) {
    return (
      <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-[13px]">
        <span className="font-semibold text-emerald-300">
          🎟 {coupon.code} · {coupon.label} 적용됨
        </span>
        <button
          onClick={() => setCoupon(null)}
          className="text-emerald-300/70 underline"
        >
          제거
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-[12.5px] text-white/45 underline"
      >
        프로모션 코드가 있으신가요?
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="코드 입력"
          autoFocus
          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-[13px] uppercase tracking-wide text-white placeholder:normal-case placeholder:tracking-normal placeholder:text-white/40 focus:border-[var(--fn-accent)] focus:outline-none"
        />
        <button
          onClick={apply}
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-xl border border-white/15 px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "…" : "적용"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[12px] text-red-400">{err}</p>}
    </div>
  );
}
