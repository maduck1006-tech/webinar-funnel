import "server-only";
import { cookies } from "next/headers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 문자열이 UUID 형태인지 (잘못된 쿼리 파라미터가 DB 캐스팅 500 을 내지 않도록) */
export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** ?l= 파라미터 우선, 없으면 fnl 쿠키에서 lead id 복구 */
export async function resolveLeadId(paramL?: string): Promise<string | null> {
  if (paramL) return isUuid(paramL) ? paramL : null;
  try {
    return (await cookies()).get("fnl")?.value ?? null;
  } catch {
    return null;
  }
}
