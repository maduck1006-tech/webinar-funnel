import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { getAbLandingState } from "@/lib/campaign";

export const runtime = "nodejs";

/**
 * 1) 관리자 영역 Clerk 인증 (로그인 필요). /admin/sign-in 은 예외.
 * 2) 랜딩 A/B: ab_landing 캠페인 방문 시 variant 쿠키(abv) 1회 지정.
 *
 * 공개: 퍼널 페이지, /api/leads, /api/toss/*, /api/cron/* (자체 시크릿)
 */
const isAdmin = createRouteMatcher([
  "/admin((?!/sign-in).*)",
  "/api/campaigns(.*)",
  "/api/crm(.*)",
  "/api/upload",
  "/preview",
]);

/**
 * 최초 광고 진입의 클릭 식별자를 90일 쿠키로 고정한다.
 * - _fbc: Meta 표준 포맷(fb.1.<ts>.<fbclid>). 픽셀보다 먼저/확실하게 심는다.
 * - _ft : first-touch 원본(JSON) — utm_*, fbclid, ref, lp, ts. 리드 생성 시 병합.
 * 이미 있으면 덮어쓰지 않는다(first-touch 유지).
 */
function applyFirstTouch(req: NextRequest, res: NextResponse) {
  const url = req.nextUrl;
  const fbclid = url.searchParams.get("fbclid");
  const cookies = req.cookies;
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 90, sameSite: "lax" as const };

  if (fbclid && !cookies.get("_fbc")) {
    res.cookies.set("_fbc", `fb.1.${Date.now()}.${fbclid}`, opts);
  }
  if (!cookies.get("_ft")) {
    const ft: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      if (k.startsWith("utm_") || k === "gclid" || k === "ttclid") ft[k] = v;
    });
    if (fbclid) ft.fbclid = fbclid;
    const ref = req.headers.get("referer");
    if (ref && !ref.includes(url.host)) ft.ref = ref.slice(0, 300);
    ft.lp = url.pathname;
    ft.ts = String(Date.now());
    if (Object.keys(ft).length > 2) {
      res.cookies.set("_ft", JSON.stringify(ft).slice(0, 900), opts);
    }
  }
}

export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;

  if (isAdmin(req)) {
    await auth.protect();
    return NextResponse.next();
  }

  // --- 랜딩 A/B ---
  const isLanding = path === "/" || /^\/[a-z0-9][a-z0-9-]*$/.test(path);
  if (isLanding && !req.cookies.get("abv")) {
    const { slugs, defaultOn } = await getAbLandingState();
    const slug = path === "/" ? null : path.slice(1);
    const on = slug ? slugs.has(slug) : defaultOn;
    if (on) {
      const variant = Math.random() < 0.5 ? "a" : "b";
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-abv", variant);
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.cookies.set("abv", variant, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
      });
      applyFirstTouch(req, res);
      return res;
    }
  }

  const res = NextResponse.next();
  applyFirstTouch(req, res);
  return res;
});

export const config = {
  matcher: [
    // Next 내부/정적파일 제외한 모든 경로 + API
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
