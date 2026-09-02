/**
 * 토스 결제 에러코드 → 사용자용 한국어 문구.
 * 클라이언트(CheckoutClient)와 서버(confirm 라우트 / fail 페이지) 양쪽에서 씀.
 * raw SDK 메시지나 내부 코드를 사용자에게 그대로 보여주지 않기 위한 매핑.
 */

export type PaymentErrorInfo = {
  title: string;
  detail: string;
  /** 같은 수단으로 다시 시도할 만한 오류인지 (false 면 다른 수단 권유) */
  retryable: boolean;
  /** 사용자가 스스로 취소한 흐름인지 (경고 아이콘 대신 중립 처리) */
  canceled: boolean;
};

const CANCEL_CODES = new Set([
  "PAY_PROCESS_CANCELED",
  "PAY_PROCESS_ABORTED",
  "USER_CANCEL",
  "USER_CANCELED",
]);

const MAP: Record<string, Omit<PaymentErrorInfo, "canceled">> = {
  // --- 카드/한도/잔액 (수단 바꾸면 될 수 있음) ---
  REJECT_CARD_COMPANY: {
    title: "카드사에서 결제가 거절됐어요",
    detail: "다른 카드로 시도하시거나 카드사에 문의해 주세요.",
    retryable: false,
  },
  INVALID_CARD_NUMBER: {
    title: "카드 정보를 다시 확인해 주세요",
    detail: "카드번호가 올바르지 않아요.",
    retryable: true,
  },
  INVALID_CARD_EXPIRATION: {
    title: "카드 정보를 다시 확인해 주세요",
    detail: "유효기간을 다시 확인해 주세요.",
    retryable: true,
  },
  INVALID_STOPPED_CARD: {
    title: "사용할 수 없는 카드예요",
    detail: "정지되었거나 사용이 제한된 카드입니다. 다른 카드로 시도해 주세요.",
    retryable: false,
  },
  NOT_ENOUGH_BALANCE: {
    title: "잔액이 부족해요",
    detail: "잔액을 확인하시거나 다른 결제수단으로 시도해 주세요.",
    retryable: false,
  },
  EXCEED_MAX_DAILY_PAYMENT_COUNT: {
    title: "오늘 결제 한도를 넘었어요",
    detail: "카드사 일일 결제 횟수를 초과했어요. 내일 다시 시도하거나 다른 카드를 이용해 주세요.",
    retryable: false,
  },
  EXCEED_MAX_ONE_DAY_AMOUNT: {
    title: "오늘 결제 한도를 넘었어요",
    detail: "카드 일일 한도를 초과했어요. 다른 카드로 시도해 주세요.",
    retryable: false,
  },
  EXCEED_MAX_AMOUNT: {
    title: "결제 한도를 넘었어요",
    detail: "결제 가능 금액을 초과했어요. 다른 수단으로 시도해 주세요.",
    retryable: false,
  },
  NOT_SUPPORTED_INSTALLMENT: {
    title: "할부가 지원되지 않아요",
    detail: "일시불로 다시 시도해 주세요.",
    retryable: true,
  },
  // --- 결제창/시스템 ---
  PROVIDER_ERROR: {
    title: "결제사에서 오류가 발생했어요",
    detail: "잠시 후 다시 시도해 주세요. 계속되면 문의해 주세요.",
    retryable: true,
  },
  FAILED_INTERNAL_SYSTEM_PROCESSING: {
    title: "결제 처리가 지연되고 있어요",
    detail: "잠시 후 다시 시도해 주세요.",
    retryable: true,
  },
  // --- 우리 서버 내부 코드 (confirm 라우트) ---
  AMOUNT_MISMATCH: {
    title: "결제 금액이 맞지 않아요",
    detail: "주문 정보가 바뀌었을 수 있어요. 주문서로 돌아가 다시 시도해 주세요.",
    retryable: true,
  },
  ORDER_NOT_FOUND: {
    title: "주문 정보를 찾지 못했어요",
    detail: "주문서로 돌아가 처음부터 다시 진행해 주세요.",
    retryable: true,
  },
  INVALID_PARAMS: {
    title: "결제 정보가 올바르지 않아요",
    detail: "주문서로 돌아가 다시 시도해 주세요.",
    retryable: true,
  },
  CONFIRM_FAILED: {
    title: "결제 승인에 실패했어요",
    detail: "결제가 완료되지 않았어요. 다시 시도하시거나 문의해 주세요.",
    retryable: true,
  },
  PAYMENT_PENDING: {
    title: "결제가 확인되는 중이에요",
    detail: "입금/승인이 완료되면 시청 페이지에서 바로 이용할 수 있어요. 잠시 후 확인해 주세요.",
    retryable: false,
  },
  WIDGET_LOAD_FAILED: {
    title: "결제 화면을 불러오지 못했어요",
    detail: "새로고침하거나 잠시 후 다시 시도해 주세요. 광고 차단 확장 프로그램이 있으면 꺼주세요.",
    retryable: true,
  },
  POPUP_BLOCKED: {
    title: "결제창이 열리지 않았어요",
    detail: "브라우저의 팝업 차단을 해제하고 다시 시도해 주세요.",
    retryable: true,
  },
};

const FALLBACK: Omit<PaymentErrorInfo, "canceled"> = {
  title: "결제를 완료하지 못했어요",
  detail: "잠시 후 다시 시도해 주세요. 계속 안 되면 신청하신 문자로 문의해 주세요.",
  retryable: true,
};

export function paymentErrorInfo(
  code?: string | null,
): PaymentErrorInfo {
  const c = (code ?? "").trim();
  const canceled = CANCEL_CODES.has(c);
  if (canceled) {
    return {
      title: "결제를 취소했어요",
      detail: "필요하면 언제든 다시 시도할 수 있어요.",
      retryable: true,
      canceled: true,
    };
  }
  return { ...(MAP[c] ?? FALLBACK), canceled: false };
}

/** 짧은 인라인 문구 (CheckoutClient 버튼 아래 등) */
export function paymentErrorText(code?: string | null): string {
  const { title, detail } = paymentErrorInfo(code);
  return `${title} — ${detail}`;
}
