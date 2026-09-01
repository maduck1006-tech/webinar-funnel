/** 010-1234-5678 / +82 10... 등 → 01012345678 로 정규화 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return d;
}
