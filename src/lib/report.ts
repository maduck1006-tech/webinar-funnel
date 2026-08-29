/**
 * 에러 리포팅 (B.7).
 * 지금은 구조화 로그만 — Vercel 함수 로그로 수집됨.
 * TODO(P2): Sentry 약관 수락 후 `vercel integration add sentry` →
 *   `@sentry/nextjs` 설치하고 아래에서 Sentry.captureException 호출 추가.
 */
export function reportError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
      at: new Date().toISOString(),
    }),
  );
}
