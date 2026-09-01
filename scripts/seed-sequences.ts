/**
 * 추천 자동 메시지 시퀀스를 전역 기본값(campaignId=NULL)으로 설치.
 * 재실행 안전 — 같은 key 의 자동화가 있으면 스텝만 교체(enabled 토글은 유지).
 *   npx tsx --env-file=.env.local scripts/seed-sequences.ts
 *
 * (docs/multi-product-funnel-plan.md 보완 2/5 — 러셀 브런슨식 팔로우업)
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  messageAutomations,
  messageAutomationSteps,
  type MessageAudience,
  type MessageAutomationTrigger,
} from "../src/db/schema";

const H = 60;
const D = 24 * 60;

type Step = { delayMinutes: number; audience: MessageAudience; body: string };
type Seq = {
  key: string;
  name: string;
  trigger: MessageAutomationTrigger;
  stopOn: string[];
  steps: Step[];
};

const SEQS: Seq[] = [
  {
    key: "soap_opera",
    name: "소프오페라 시퀀스 (신청 후 5일 스토리)",
    trigger: "signup",
    stopOn: ["purchase", "booking"],
    steps: [
      {
        delayMinutes: 1 * D,
        audience: "all",
        body: "{이름}님, 어제 강의는 좀 보셨나요?\n제가 이 일을 시작한 계기부터 말씀드릴게요. 사실 저도 3년 전엔 '내 경험이 상품이 될까' 의심만 하던 사람이었어요.\n오늘은 여기까지. 내일 이어서 보내드릴게요.\n📎 {링크}",
      },
      {
        delayMinutes: 2 * D,
        audience: "all",
        body: "{이름}님, 어제 얘기 이어서요.\n첫 상품을 만들고 3주 동안 한 명도 안 팔렸습니다. 문제는 '무엇을 파느냐'가 아니라 '어떻게 제안하느냐'였어요.\n이걸 깨닫고 나서 모든 게 바뀌었습니다.\n📎 {링크}",
      },
      {
        delayMinutes: 3 * D,
        audience: "not_purchased",
        body: "{이름}님, 그 '제안하는 방법' 전체를 정리한 게 {상품명}이에요.\n강의만 봐도 도움은 되지만, 실제로 팔리는 문장·구조는 이 자료에 다 들어있습니다.\n👉 {결제링크}",
      },
      {
        delayMinutes: 4 * D,
        audience: "not_purchased",
        body: "{이름}님, {상품명} 특가는 무료 시청 기간이 끝나면 같이 닫힙니다.\n지금 붙잡아두세요.\n👉 {결제링크}",
      },
      {
        delayMinutes: 5 * D - 2 * H,
        audience: "not_purchased",
        body: "마지막 안내예요. 몇 시간 뒤면 {상품명} 링크가 사라지고 정가로 돌아갑니다.\n나중에 다시 열어달라 하셔도 안 됩니다.\n👉 {결제링크}",
      },
    ],
  },
  {
    key: "watched_no_buy",
    name: "봤는데 안 산 사람",
    trigger: "watch_start",
    stopOn: ["purchase"],
    steps: [
      {
        delayMinutes: 2 * H,
        audience: "not_purchased",
        body: "{이름}님, 강의 보시는 중이죠? 15분 구간 세팅 파트, {상품명} 없이 혼자 하면 진짜 오래 걸려요.\n👉 {결제링크}",
      },
      {
        delayMinutes: 1 * D,
        audience: "not_purchased",
        body: "{이름}님, 어제 강의 다 보셨나요?\n실행에서 막히는 지점을 {상품명}이 그대로 메꿔줍니다. 시청 기간 안에만 이 가격이에요.\n👉 {결제링크}",
      },
      {
        delayMinutes: 2 * D,
        audience: "not_purchased",
        body: "{이름}님, {상품명} 특가 링크가 곧 닫힙니다. 강의 내용 써먹으시려면 지금이 마지막 타이밍이에요.\n👉 {결제링크}",
      },
    ],
  },
  {
    key: "cart_abandon",
    name: "결제하다 이탈한 사람",
    trigger: "cart_abandon",
    stopOn: ["purchase"],
    steps: [
      {
        delayMinutes: 0,
        audience: "not_purchased",
        body: "{이름}님, 결제하다 창이 닫히셨네요. 결제 오류였다면 아래에서 다시 시도해보세요.\n👉 {결제링크}",
      },
      {
        delayMinutes: 3 * H,
        audience: "not_purchased",
        body: "{이름}님, 아까 담아두신 {상품명} 아직 남아있어요. 카드 문제였으면 다른 수단으로도 됩니다.\n👉 {결제링크}",
      },
      {
        delayMinutes: 20 * H,
        audience: "not_purchased",
        body: "{이름}님, {상품명} 특가는 오늘까지예요. 놓치면 정가로 돌아갑니다.\n👉 {결제링크}",
      },
    ],
  },
  {
    key: "post_purchase_ascend",
    name: "결제 후 온보딩 + 다음 오퍼",
    trigger: "purchase",
    stopOn: [],
    steps: [
      {
        delayMinutes: 0,
        audience: "all",
        body: "{이름}님, 결제 완료됐습니다! 바로 이용하실 수 있어요.\n📎 {다운로드링크}\n문의는 이 번호로 답장 주세요.",
      },
      {
        delayMinutes: 2 * D,
        audience: "all",
        body: "{이름}님, {상품명} 잘 보고 계신가요?\n다음 단계로 준비하시는 분들을 위한 자료도 있어요. 관심 있으면 여기서 확인해보세요.\n👉 {세일즈링크}",
      },
    ],
  },
];

async function upsert(seq: Seq) {
  const [existing] = await db
    .select({ id: messageAutomations.id })
    .from(messageAutomations)
    .where(
      and(isNull(messageAutomations.campaignId), eq(messageAutomations.key, seq.key)),
    );

  let id: string;
  if (existing) {
    id = existing.id;
    await db
      .update(messageAutomations)
      .set({ name: seq.name, trigger: seq.trigger, stopOn: seq.stopOn, updatedAt: new Date() })
      .where(eq(messageAutomations.id, id));
    await db
      .delete(messageAutomationSteps)
      .where(eq(messageAutomationSteps.automationId, id));
  } else {
    const [row] = await db
      .insert(messageAutomations)
      .values({
        campaignId: null,
        key: seq.key,
        name: seq.name,
        trigger: seq.trigger,
        stopOn: seq.stopOn,
        // 새로 설치되는 추천 시퀀스는 기본 꺼짐 — 사장이 검토 후 켜도록
        enabled: false,
      })
      .returning({ id: messageAutomations.id });
    id = row.id;
  }

  await db.insert(messageAutomationSteps).values(
    seq.steps.map((s, i) => ({
      automationId: id,
      stepOrder: i + 1,
      delayMinutes: s.delayMinutes,
      audience: s.audience,
      body: s.body,
    })),
  );
  console.log(`✓ ${seq.key} (${seq.steps.length} steps)${existing ? "" : " · 새로 설치(꺼짐)"}`);
}

async function main() {
  for (const seq of SEQS) await upsert(seq);
  console.log(`\n${SEQS.length}개 시퀀스 반영 완료. /admin/automation 에서 켜세요.`);
}

main().then(() => process.exit(0));
