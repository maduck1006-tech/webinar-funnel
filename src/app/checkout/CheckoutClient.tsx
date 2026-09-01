"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk";

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
  const [withBump, setWithBump] = useState(false);

  const amount = product.price + (withBump && bump ? bump.price : 0);

  if (!clientKey) {
    return (
      <Shell>
        <p className="text-sm text-red-400">
          결제가 아직 연결되지 않았습니다. (관리자: NEXT_PUBLIC_TOSS_CLIENT_KEY 설정
          필요)
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
            </div>
          </div>
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
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [phone, setPhone] = useState(defaultValues?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaignId ?? undefined,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          landingUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = (await res.json()) as { leadId?: string; error?: string };
      if (!res.ok || !data.leadId) {
        setErr(data.error || "정보 저장에 실패했습니다. 입력값을 확인해 주세요.");
        setBusy(false);
        return;
      }
      onDone({
        id: data.leadId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
    } catch {
      setErr("네트워크 오류입니다. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <Field value={name} onChange={setName} placeholder="이름" autoComplete="name" />
      <Field
        value={email}
        onChange={setEmail}
        placeholder="이메일"
        type="email"
        autoComplete="email"
      />
      <Field
        value={phone}
        onChange={setPhone}
        placeholder="휴대폰 번호"
        type="tel"
        autoComplete="tel"
      />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy || !name.trim() || !email.trim() || phone.trim().length < 8}
        className="mt-2 w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: "var(--fn-accent)" }}
      >
        {busy ? "저장 중…" : "다음 · 결제하기"}
      </button>
      <p className="pt-1 text-center text-[11px] text-white/40">
        입력하신 정보는 주문 처리와 상품 안내에만 사용됩니다.
      </p>
    </form>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      autoComplete={autoComplete}
      inputMode={type === "tel" ? "numeric" : undefined}
      className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/40 focus:border-[var(--fn-accent)] focus:outline-none"
    />
  );
}

/* ---------- 2단계: 결제 ---------- */

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

  // 멤버십: 빌링 인증(카드 등록) → 리다이렉트. 정기결제는 크론이 청구.
  const payMembership = useCallback(async () => {
    if (paying || !lead?.id) return;
    setPaying(true);
    setErr(null);
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
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("CANCELED")) setErr(msg);
      setPaying(false);
    }
  }, [paying, lead, clientKey, successUrl, failUrl]);

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
        setErr(String(e));
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
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        amount?: number;
        orderName?: string;
        error?: string;
      };
      if (!res.ok || !data.orderId) {
        setErr(data.error || "주문 생성에 실패했습니다.");
        setPaying(false);
        return;
      }
      await widgetsRef.current.setAmount({
        currency: "KRW",
        value: data.amount ?? amount,
      });
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
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("PAY_PROCESS_CANCELED")) setErr(msg);
      setPaying(false);
    }
  }, [paying, productId, role, lead, withBump, bump, amount, successUrl, failUrl]);

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
