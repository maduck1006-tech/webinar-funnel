import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAbLandingState } from "@/lib/campaign";

export const runtime = "nodejs";

/**
 * 1) 관리자 영역 Clerk 인증 (로그인 필요). /admin/sign-in 은 예외.
 * 2) 랜딩 A/B: ab_landing 캠페인 방문 시 variant 쿠키(abv) 1회 지정.
 *
 * 공개: 퍼널 페이지, /api/leads, /api/latpeed/webhook, /api/cron/* (자체 시크릿)
 */
const isAdmin = createRouteMatcher([
  "/admin((?!/sign-in).*)",
  "/api/campaigns(.*)",
  "/api/crm(.*)",
  "/api/upload",
  "/preview",
]);

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
      return res;
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Next 내부/정적파일 제외한 모든 경로 + API
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
