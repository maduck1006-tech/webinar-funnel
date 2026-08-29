import "server-only";
import { cookies } from "next/headers";

/** ?l= 파라미터 우선, 없으면 fnl 쿠키에서 lead id 복구 */
export async function resolveLeadId(paramL?: string): Promise<string | null> {
  if (paramL) return paramL;
  try {
    return (await cookies()).get("fnl")?.value ?? null;
  } catch {
    return null;
  }
}
