/**
 * Next.js instrumentation (B.7).
 * onRequestError 는 서버에서 처리되지 않은 에러를 잡는다 — 래피드 웹훅 5초 SLA 추적에 유용.
 * TODO(P2): Sentry 설치 후 여기서 Sentry.captureRequestError 연결.
 */
import { reportError } from "@/lib/report";

export function register() {
  // no-op (Sentry init 자리)
}

export const onRequestError: import("next").Instrumentation.onRequestError =
  async (err, request) => {
    reportError("request", err, { path: request.path, method: request.method });
  };
