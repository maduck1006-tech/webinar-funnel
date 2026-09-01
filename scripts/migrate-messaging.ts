/**
 * automation_triggers + campaign_messages → message_automations 통합 마이그레이션. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/migrate-messaging.ts
 *
 * - 전역 기본 자동화 5종 생성 (없을 때만)
 * - campaign_messages 오버라이드 → 캠페인 전용 자동화 복사본
 * - 구 automation_triggers / campaign_messages / message_logs 는 건드리지 않음(과거 데이터 보존)
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  automationTriggers,
  campaignMessages,
  messageAutomations,
  messageAutomationSteps,
} from "../src/db/schema";

type StepDef = {
  delayMinutes: number;
  audience: "all" | "not_watched" | "not_purchased" | "not_booked";
  body: string;
};

const DEFAULTS: {
  key: string;
  name: string;
  trigger: "signup" | "watch_start" | "purchase" | "booking";
  stopOn: string[];
  steps: StepDef[];
}[] = [
  {
    key: "signup_confirm",
    name: "신청 확인",
    trigger: "signup",
    stopOn: [],
    steps: [
      {
        delayMinutes: 0,
        audience: "all",
        body:
          "{이름}님, 신청하신 강의 시청 링크입니다.\n{링크}\n\n지금 바로 보실 수 있고, 48시간 뒤 자동으로 닫힙니다. 오늘 안에 1편이라도 꼭 보세요.",
      },
    ],
  },
  {
    key: "watch_deadline",
    name: "시청 마감 리마인더",
    trigger: "signup",
    stopOn: ["purchase", "booking"],
    steps: [
      {
        delayMinutes: 24 * 60,
        audience: "not_watched",
        body:
          "{이름}님, 어제 신청하신 무료 강의가 24시간 뒤 닫힙니다.\n\n'내일 봐야지' 하다 놓치는 분이 정말 많아요. 오늘 밤 30분만 내서 보세요. 2배속도 괜찮습니다.\n📎 {링크}",
      },
      {
        delayMinutes: 36 * 60,
        audience: "not_watched",
        body:
          "무료 강의 마감까지 12시간 남았습니다.\n\n아직 못 보셨다면 지금이 마지막이에요. 시간 없으시면 후반부(상담·계약 파트)만이라도 보고 닫으세요.\n📎 {링크}",
      },
      {
        delayMinutes: 47 * 60,
        audience: "not_watched",
        body:
          "{이름}님, 무료 강의가 1시간 뒤 닫힙니다. 지금 안 열면 다시 못 봐요.\n\n{상품명} 특가도 영상과 함께 종료됩니다. 2배속으로라도 지금 켜두세요.\n📎 {링크}",
      },
    ],
  },
  {
    key: "payment_nudge",
    name: "결제 유도",
    trigger: "watch_start",
    stopOn: ["purchase"],
    steps: [
      {
        delayMinutes: 30,
        audience: "not_purchased",
        body:
          "{이름}님, 김영진입니다.\n강의 보시다가 상세페이지 파트에서 결제창을 닫으신 것 같아요.\n\n그 부분에 나오는 템플릿·스크립트를 바로 쓸 수 있게 정리한 게 {상품명}입니다. 직접 만들면 며칠 걸리는 분량이에요.\n\n무료 시청 기간 동안만 이 가격이라 링크 다시 보내드립니다.\n👉 {결제링크}\n\n(영상 링크도 같이 둘게요: {링크})",
      },
    ],
  },
  {
    key: "payment_done",
    name: "결제 완료 안내",
    trigger: "purchase",
    stopOn: [],
    steps: [
      {
        delayMinutes: 0,
        audience: "all",
        body:
          "{이름}님, 결제 완료됐습니다. 워크북은 결제 페이지 또는 문자 링크에서 바로 받으실 수 있어요.\n\n다음 단계로 1:1 무료 상담(30분)도 준비돼 있습니다. 편한 시간을 골라주세요.\n👉 {예약링크}",
      },
    ],
  },
];

/** 구 트리거 키 → 새 automation key + 스텝 인덱스 (campaign_messages 오버라이드 매핑용) */
const OLD_TO_NEW: Record<string, { key: string; stepIndex: number }> = {
  signup_confirm: { key: "signup_confirm", stepIndex: 0 },
  reminder_24h: { key: "watch_deadline", stepIndex: 0 },
  reminder_12h_left: { key: "watch_deadline", stepIndex: 1 },
  reminder_1h_left: { key: "watch_deadline", stepIndex: 2 },
  pre_payment_nudge: { key: "payment_nudge", stepIndex: 0 },
  payment_success: { key: "payment_done", stepIndex: 0 },
};

async function ensureAutomation(
  campaignId: string | null,
  def: (typeof DEFAULTS)[number],
) {
  const [existing] = await db
    .select()
    .from(messageAutomations)
    .where(
      and(
        campaignId
          ? eq(messageAutomations.campaignId, campaignId)
          : isNull(messageAutomations.campaignId),
        eq(messageAutomations.key, def.key),
      ),
    );
  if (existing) return existing.id;

  const [row] = await db
    .insert(messageAutomations)
    .values({
      campaignId,
      key: def.key,
      name: def.name,
      trigger: def.trigger,
      stopOn: def.stopOn,
      // 구 트리거의 enabled 승계 (전역만)
      enabled: true,
    })
    .returning({ id: messageAutomations.id });

  await db.insert(messageAutomationSteps).values(
    def.steps.map((s, i) => ({
      automationId: row.id,
      stepOrder: i + 1,
      delayMinutes: s.delayMinutes,
      audience: s.audience,
      body: s.body,
    })),
  );
  return row.id;
}

async function main() {
  // 1) 전역 기본 5종
  const globalTriggers = await db.select().from(automationTriggers).catch(() => []);
  const enabledByKey = new Map(globalTriggers.map((t) => [t.key, t.enabled]));

  for (const def of DEFAULTS) {
    const id = await ensureAutomation(null, def);
    // 구 트리거가 꺼져 있었으면 automation 도 끔
    const anyOldKey = Object.entries(OLD_TO_NEW).find(
      ([, v]) => v.key === def.key,
    )?.[0];
    if (anyOldKey && enabledByKey.get(anyOldKey as never) === false) {
      await db
        .update(messageAutomations)
        .set({ enabled: false })
        .where(eq(messageAutomations.id, id));
    }
    // 구 트리거 본문이 있으면 스텝 body 로 이관 (단일 스텝 automation 만; 리마인더는 3개라 스킵)
    if (def.steps.length === 1 && anyOldKey) {
      const [ot] = globalTriggers.filter((t) => t.key === (anyOldKey as never));
      if (ot?.template) {
        const [step] = await db
          .select()
          .from(messageAutomationSteps)
          .where(eq(messageAutomationSteps.automationId, id));
        if (step)
          await db
            .update(messageAutomationSteps)
            .set({ body: ot.template })
            .where(eq(messageAutomationSteps.id, step.id));
      }
    }
    console.log(`global automation: ${def.key} (${id})`);
  }

  // 2) campaign_messages 오버라이드 → 캠페인 전용 automation
  const overrides = await db.select().from(campaignMessages).catch(() => []);
  const byCampaign = new Map<string, typeof overrides>();
  for (const o of overrides) {
    if (!o.campaignId) continue;
    const arr = byCampaign.get(o.campaignId) ?? [];
    arr.push(o);
    byCampaign.set(o.campaignId, arr);
  }

  for (const [campaignId, rows] of byCampaign) {
    // 오버라이드된 automation key 집합
    const keys = new Set(
      rows.map((r) => OLD_TO_NEW[r.trigger]?.key).filter(Boolean) as string[],
    );
    for (const key of keys) {
      const def = DEFAULTS.find((d) => d.key === key);
      if (!def) continue;
      const autoId = await ensureAutomation(campaignId, def);
      // 각 스텝 body 를 오버라이드로 교체
      const steps = await db
        .select()
        .from(messageAutomationSteps)
        .where(eq(messageAutomationSteps.automationId, autoId));
      for (const r of rows) {
        const m = OLD_TO_NEW[r.trigger];
        if (!m || m.key !== key || !r.template) continue;
        const step = steps.find((s) => s.stepOrder === m.stepIndex + 1);
        if (step)
          await db
            .update(messageAutomationSteps)
            .set({ body: r.template, enabled: r.enabled })
            .where(eq(messageAutomationSteps.id, step.id));
      }
      console.log(`campaign automation: ${campaignId} / ${key}`);
    }
  }

  console.log("done");
}

main().then(() => process.exit(0));
