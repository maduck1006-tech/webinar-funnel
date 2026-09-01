import { NextResponse } from "next/server";
import { runDueSequenceSteps } from "@/lib/sequences";

export const runtime = "nodejs";

/**
 * Follow-up 시퀀스 스텝 발송. 외부 크론(cron-job.org)에서 15분마다 호출.
 *   GET /api/cron/sequences  (Authorization: Bearer CRON_SECRET)
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueSequenceSteps();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
