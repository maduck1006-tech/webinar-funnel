import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, leads } from "@/db/schema";
import { normalizePhone } from "@/lib/latpeed";
import { getDefaultCampaign } from "@/lib/campaign";
import { sendTriggerOnce } from "@/lib/campaign-messages";

const bodySchema = z.object({
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40).optional(),
  email: z.string().email(),
  phone: z.string().min(8),
  utm: z.record(z.string(), z.string()).optional(),
});

const FALLBACK_WINDOW_H = Number(process.env.VOD_ACCESS_WINDOW_HOURS ?? 48);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const { utm, name, campaignId } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

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
      utm,
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

  const res = NextResponse.json({ leadId: row.id });
  res.cookies.set("fnl", row.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: windowH * 3600,
  });
  return res;
}
