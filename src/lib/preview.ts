/**
 * 개발용 미리보기 게이트.
 * - 로컬 개발: 항상 허용
 * - Vercel Preview 배포: 허용 (내부 검토용)
 * - Vercel Production: 차단
 *
 * ⚠️ Vercel의 프리뷰/프로덕션 빌드는 둘 다 NODE_ENV=production 이므로
 *    NODE_ENV 로 구분하면 안 되고 VERCEL_ENV 를 봐야 한다.
 */
export function previewEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}
