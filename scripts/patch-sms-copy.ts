/**
 * CRM 문자(SMS) 카피 교정 (1회성, 재실행 안전).
 *   npx tsx --env-file=.env.local scripts/patch-sms-copy.ts
 *
 * - 근거 없는 수치 제거("5만 원 가치" 반복, "3배", "200%")
 * - 과도한 구어체/가짜 희소성 정리 ("안 열어드립니다 ㅠㅠ", "한 번만 뜨는 링크")
 * - 할인 소멸 스토리를 무료 시청 기간(48h)에 일원화
 * - 마감 압박은 유지하되 '강의를 왜 봐야 하는지'를 같이 전달
 * automation_triggers(전역 기본값) 업데이트. 캠페인 오버라이드(campaign_messages)는 건드리지 않음.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { automationTriggers, messageTrigger } from "../src/db/schema";

type TriggerKey = (typeof messageTrigger.enumValues)[number];

const TEMPLATES: Partial<Record<TriggerKey, string>> = {
  signup_confirm:
    "{이름}님, 신청하신 강의 시청 링크입니다.\n{링크}\n\n지금 바로 보실 수 있고, 48시간 뒤 자동으로 닫힙니다. 오늘 안에 1편이라도 꼭 보세요.",

  pre_payment_nudge:
    "{이름}님, 김영진입니다.\n강의 보시다가 상세페이지 파트에서 결제창을 닫으신 것 같아요.\n\n그 부분에 나오는 템플릿·스크립트를 바로 쓸 수 있게 정리한 게 {상품명}입니다. 직접 만들면 며칠 걸리는 분량이에요.\n\n무료 시청 기간 동안만 이 가격이라 링크 다시 보내드립니다.\n👉 {결제링크}\n\n(영상 링크도 같이 둘게요: {링크})",

  reminder_24h:
    "{이름}님, 어제 신청하신 무료 강의가 24시간 뒤 닫힙니다.\n\n'내일 봐야지' 하다 놓치는 분이 정말 많아요. 오늘 밤 30분만 내서 보세요. 2배속도 괜찮습니다.\n📎 {링크}",

  reminder_12h_left:
    "무료 강의 마감까지 12시간 남았습니다.\n\n아직 못 보셨다면 지금이 마지막이에요. 시간 없으시면 후반부(상담·계약 파트)만이라도 보고 닫으세요.\n📎 {링크}",

  reminder_1h_left:
    "{이름}님, 무료 강의가 1시간 뒤 닫힙니다. 지금 안 열면 다시 못 봐요.\n\n{상품명} 특가도 영상과 함께 종료됩니다. 2배속으로라도 지금 켜두세요.\n📎 {링크}",

  payment_success:
    "{이름}님, 결제 완료됐습니다. 워크북은 결제 페이지 또는 문자 링크에서 바로 받으실 수 있어요.\n\n다음 단계로 1:1 무료 상담(30분)도 준비돼 있습니다. 편한 시간을 골라주세요.\n👉 {예약링크}",
};

async function main() {
  let n = 0;
  for (const [key, template] of Object.entries(TEMPLATES) as [
    TriggerKey,
    string,
  ][]) {
    const res = await db
      .update(automationTriggers)
      .set({ template })
      .where(eq(automationTriggers.key, key))
      .returning({ key: automationTriggers.key });
    if (res.length) {
      n++;
      console.log(`patched: ${key}`);
    } else {
      console.log(`skip (없음): ${key}`);
    }
  }
  console.log(`done: ${n} template(s)`);
}

main().then(() => process.exit(0));
