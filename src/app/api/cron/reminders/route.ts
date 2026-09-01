import { NextResponse } from "next/server";
import { runDueAutomationSteps } from "@/lib/messaging";
import { sendEventPreReminders } from "@/lib/events";
import { enrollAbandonedCarts } from "@/lib/cart";

export const runtime = "nodejs";

/**
 * 자동 메시지 스텝 발송. 외부 크론(cron-job.org) 15분 간격 + Vercel 크론 일 1회.
 *   GET /api/cron/reminders  (Authorization: Bearer CRON_SECRET)
 *
 * 통합 전 이름(reminders)을 유지 — cron-job.org 설정 변경 불필요.
 * 모든 CRM 문자(신청확인·리마인더·결제유도·완료안내·사용자 시퀀스)가 여기로 일원화됨.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // 이탈 카트 등록을 먼저 → 이번 실행의 runDueAutomationSteps 에서 delay0 스텝 발송
    const carts = await enrollAbandonedCarts().catch(() => 0);
    const result = await runDueAutomationSteps();
    const events = await sendEventPreReminders().catch(() => ({ d1: 0, h1: 0 }));
    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      ...result,
      events,
      cartsEnrolled: carts,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
