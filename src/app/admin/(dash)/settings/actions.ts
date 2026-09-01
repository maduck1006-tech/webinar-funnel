"use server";

import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/solapi";

export type TestResult = { ok: boolean; message: string };

/** 솔라피 연결 테스트 — 입력한 번호로 문자 1건 발송 */
export async function sendTestSms(
  _prev: TestResult | null,
  fd: FormData,
): Promise<TestResult> {
  const to = normalizePhone(String(fd.get("to") ?? ""));
  if (!to || to.length < 10) {
    return { ok: false, message: "받을 번호를 정확히 입력하세요." };
  }
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    return { ok: false, message: "SOLAPI_API_KEY / SECRET 이 설정되지 않았습니다." };
  }
  if (!process.env.SOLAPI_SENDER) {
    return { ok: false, message: "SOLAPI_SENDER(발신번호)가 설정되지 않았습니다." };
  }
  try {
    await sendSms(
      to,
      "[웨비나 퍼널] 솔라피 연결 테스트입니다. 이 문자를 받으셨다면 정상입니다.",
    );
    return { ok: true, message: `${to} 로 발송했습니다. 수신 확인해 주세요.` };
  } catch (e) {
    return {
      ok: false,
      message: `발송 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
