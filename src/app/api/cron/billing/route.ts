import { NextResponse } from "next/server";
import { runDueBilling } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * 멤버십 정기결제 청구 (수동/일1회). 15분 크론에도 reminders 경유로 함께 돈다.
 *   GET /api/cron/billing  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runDueBilling();
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
