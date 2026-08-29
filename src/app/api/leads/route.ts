import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, leads } from "@/db/schema";
import { normalizePhone } from "@/lib/latpeed";
import { getDefaultCampaign } from "@/lib/campaign";
import { sendTriggerOnce } from "@/lib/campaign-messages";
import { sendMetaEvent } from "@/lib/meta-capi";

const bodySchema = z.object({
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40).optional(),
  email: z.string().email(),
  phone: z.string().min(8),
  utm: z.record(z.string(), z.string()).optional(),
  fbclid: z.string().max(600).optional(),
  fbc: z.string().max(600).optional(),
  fbp: z.string().max(200).optional(),
  landingUrl: z.string().max(500).optional(),
  referrer: z.string().max(300).optional(),
});

/** 쿠키 문자열에서 name 값 추출 */
function readCookie(cookieHeader: string | null, name: string) {
  return cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  )?.[1];
}

const FALLBACK_WINDOW_H = Number(process.env.VOD_ACCESS_WINDOW_HOURS ?? 48);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { name, campaignId } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  // --- 광고 귀속: first-touch 쿠키(_ft) + _fbc/_fbp 쿠키 + 요청 헤더 병합 ---
  const cookieHeader = req.headers.get("cookie") ?? null;
  let firstTouch: Record<string, string> = {};
  try {
    const raw = readCookie(cookieHeader, "_ft");
    if (raw) firstTouch = JSON.parse(decodeURIComponent(raw));
  } catch {
    /* 손상된 쿠키 무시 */
  }
  const ftUtm: Record<string, string> = {};
  for (const [k, v] of Object.entries(firstTouch)) {
    if (k.startsWith("utm_")) ftUtm[k] = v;
  }
  // body utm 이 최종 우선 (마지막 클릭), 없으면 first-touch
  const utm = { ...ftUtm, ...(parsed.data.utm ?? {}) };
  const fbclid =
    parsed.data.fbclid ?? firstTouch.fbclid ?? undefined;
  const fbc =
    parsed.data.fbc ??
    readCookie(cookieHeader, "_fbc") ??
    (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
  const fbp = parsed.data.fbp ?? readCookie(cookieHeader, "_fbp") ?? undefined;
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  const clientUa = req.headers.get("user-agent")?.slice(0, 400) ?? undefined;
  const landingUrl = parsed.data.landingUrl ?? firstTouch.lp ?? undefined;

  // 캠페인 확인 (없으면 기본 캠페인)
  let campaign = null as Awaited<ReturnType<typeof getDefaultCampaign>>;
  if (campaignId) {
    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    campaign = c ?? null;
  }
  if (!campaign) campaign = await getDefaultCampaign();

  const windowH = campaign?.vodWindowHours ?? FALLBACK_WINDOW_H;
  const vodExpiresAt = new Date(Date.now() + windowH * 3600 * 1000);

  // A/B: 방문 시 지정된 랜딩 변형
  const abvRaw = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)abv=(a|b)/)?.[1];
  const landingVariant =
    campaign?.abLanding && (abvRaw === "a" || abvRaw === "b") ? abvRaw : null;

  const [row] = await db
    .insert(leads)
    .values({
      campaignId: campaign?.id ?? null,
      landingVariant,
      name: name ?? null,
      email,
      phone,
      utm: Object.keys(utm).length ? utm : undefined,
      fbc,
      fbp,
      fbclid,
      clientIp,
      clientUa,
      landingUrl: landingUrl ?? null,
      referrer: parsed.data.referrer ?? firstTouch.ref ?? null,
      vodExpiresAt,
    })
    .returning({ id: leads.id });

  // 신청 즉시 확인 문자 (응답 후 백그라운드 발송)
  after(async () => {
    try {
      await sendTriggerOnce({
        leadId: row.id,
        phone,
        campaignId: campaign?.id ?? null,
        trigger: "signup_confirm",
      });
    } catch {
      /* 발송 실패가 신청 자체를 막지 않음 */
    }
  });

  // Meta Conversions API — Lead (브라우저 픽셀과 event_id 로 중복 제거)
  after(async () => {
    try {
      await sendMetaEvent({
        pixelId: campaign?.metaPixelId,
        eventName: "Lead",
        eventId: `lead.${row.id}`,
        eventSourceUrl: landingUrl,
        user: {
          email,
          phone,
          firstName: name ?? undefined,
          fbc,
          fbp,
          clientIp,
          clientUa,
          externalId: row.id,
        },
      });
    } catch {
      /* CApI 실패가 신청을 막지 않음 */
    }
  });

  const res = NextResponse.json({ leadId: row.id });
  res.cookies.set("fnl", row.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: windowH * 3600,
  });
  return res;
}
