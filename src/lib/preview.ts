/**
 * `?preview=1` VOD 게이팅 우회 허용 여부.
 * 이건 공개 퍼널 페이지(/vod)에 붙는 파라미터라 프로덕션에서는 반드시 차단
 * (안 그러면 누구나 ?preview=1 로 무료 시청). 로컬·Vercel Preview 배포에서만 허용.
 *
 * ⚠️ Vercel의 프리뷰/프로덕션 빌드는 둘 다 NODE_ENV=production 이므로
 *    NODE_ENV 로 구분하면 안 되고 VERCEL_ENV 를 봐야 한다.
 *
 * 참고: /preview 오버뷰 페이지는 Clerk 인증(미들웨어)으로 보호되므로
 *       이 함수와 무관하게 프로덕션에서도 관리자에게 노출된다.
 */
export function previewEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}
