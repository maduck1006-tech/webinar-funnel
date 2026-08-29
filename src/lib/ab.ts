import "server-only";
import { cookies, headers } from "next/headers";
import type { Variant } from "@/lib/campaign";

/** middleware 가 지정한 랜딩 변형. 요청 헤더(첫 방문) → abv 쿠키(재방문) → 'a' */
export async function resolveVariant(): Promise<Variant> {
  try {
    const h = (await headers()).get("x-abv");
    if (h === "a" || h === "b") return h;
  } catch {
    /* noop */
  }
  try {
    const c = (await cookies()).get("abv")?.value;
    if (c === "a" || c === "b") return c;
  } catch {
    /* noop */
  }
  return "a";
}
