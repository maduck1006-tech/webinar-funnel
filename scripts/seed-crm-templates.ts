/**
 * PDF 기획서 문구를 automation_triggers(전역 기본값)에 반영. 재실행 안전(upsert).
 *   npx tsx --env-file=.env.local scripts/seed-crm-templates.ts
 *
 * signup_confirm 은 message_trigger enum 에 값이 있어야 함(vod-dd 배선 후).
 * enum 없으면 그 항목만 건너뛰고 나머지는 반영.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { automationTriggers } from "../src/db/schema";

type Row = {
  key: string;
  label: string;
  condition: string;
  offsetHours: number | null;
  enabled?: boolean;
  template: string;
};

const ROWS: Row[] = [
  {
    key: "signup_confirm",
    label: "신청 즉시 · 시청 링크",
    condition: "신청 접수",
    offsetHours: null,
    template:
      "{이름}님, 🎉 신청하신 강의 시청 링크가 도착했습니다.\n{링크}\n\n해당 강의는 48시간 뒤 자동으로 비공개 전환됩니다.",
  },
  {
    key: "pre_payment_nudge",
    // offset_hours 는 integer 컬럼이라 0.5 불가 → null 로 두면 크론이 FALLBACK_NUDGE_H(0.5=30분) 사용
    label: "VOD 진입 +30분 · 워크북 재제안",
    condition: "시청 시작 · 저가상품 미결제",
    offsetHours: null,
    template:
      "앗 김영진입니다. 제공한 영상 보고 계시죠?\n영상 15분 구간부터 나오는 세팅 파트 보실 때 아까 보여드린 {상품명} 없으면 혼자 하시기 좀 빡세실 겁니다;;\n\n아까 결제창 그냥 닫으셔서 놓치신 것 같은데, 원래 한 번만 뜨는 링크 하나 더 남길 테니 영상 보실 때 꼭 같이 띄워두고 보세요!\n👉 {다운로드링크}\n\n(혹시 창 닫으셨을까 봐 영상 링크도 같이 둡니다.)\n📎 {링크}",
  },
  {
    key: "reminder_24h",
    label: "신청 +24h · 절반 지남",
    condition: "미시청",
    offsetHours: 24,
    template:
      "어제 열어드린 무료 강의가 딱 24시간 남았습니다. 내일 봐야지 하고 미루시다 놓치는 분들이 많아서 퇴근 전에 톡 하나 남깁니다.\n\n지금 안 보시면 추가로 5만 원 가치의 {상품명} 특가 링크도 24시간 뒤 영상이랑 같이 닫힙니다. 오늘 밤에 무조건 챙겨보세요!\n📎 {링크}",
  },
  {
    key: "reminder_12h_left",
    label: "신청 +36h · 12시간 남음",
    condition: "미시청",
    offsetHours: 36,
    template:
      "무료 강의 만료까지 이제 12시간 남았습니다. 다 보시고 막막하실까 봐 열어둔 5만 원 가치의 {상품명} 특가도 12시간 뒤면 완전 종료됩니다.\n\n나중에 다시 열어달라고 하셔도 안 열어드립니다 ㅠㅠ 후회하지 마시고 지금 당장 열어두세요.\n📎 {링크}",
  },
  {
    key: "reminder_1h_left",
    label: "신청 +47h · 마지막 1시간",
    condition: "미시청",
    offsetHours: 47,
    template:
      "진짜 닫힙니다. 무료 강의가 딱 1시간 남았습니다.\n\n영상 보실 때 최소 3배 아껴드리는 5만 원 가치의 {상품명}도 1시간 뒤면 원래 가격으로 돌아가고 링크가 사라집니다. 정 시간 없으시면 지금 들어와서 2배속으로라도 꼭 보세요!\n📎 {링크}",
  },
  // payment_success / payment_cancel_admin 은 제거됨.
  // 결제·다운로드 안내는 래피드(Latpeed) 자체 감사 문자에 위임.
];

/** 더 이상 발송하지 않는 트리거 — 전역 row 정리 */
const REMOVE_KEYS = ["payment_success", "payment_cancel_admin"];

async function enumValues(): Promise<Set<string>> {
  const rows = await db.execute(
    sql`select e.enumlabel as v
        from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'message_trigger'`,
  );
  return new Set(
    (rows as unknown as { rows: { v: string }[] }).rows?.map((r) => r.v) ??
      (rows as unknown as { v: string }[]).map((r) => r.v),
  );
}

async function main() {
  const valid = await enumValues();
  let done = 0;
  const skipped: string[] = [];

  for (const r of ROWS) {
    if (!valid.has(r.key)) {
      skipped.push(r.key);
      continue;
    }
    await db
      .insert(automationTriggers)
      .values({
        key: r.key as (typeof automationTriggers.$inferInsert)["key"],
        label: r.label,
        condition: r.condition,
        offsetHours: r.offsetHours,
        enabled: r.enabled ?? true,
        template: r.template,
      })
      .onConflictDoUpdate({
        target: automationTriggers.key,
        set: {
          label: r.label,
          condition: r.condition,
          offsetHours: r.offsetHours,
          template: r.template,
          updatedAt: new Date(),
        },
      });
    done++;
    console.log(`✓ ${r.key}`);
  }

  for (const k of REMOVE_KEYS) {
    if (!valid.has(k)) continue;
    await db
      .delete(automationTriggers)
      .where(eq(automationTriggers.key, k as (typeof automationTriggers.$inferInsert)["key"]));
    console.log(`− ${k} (제거)`);
  }

  console.log(`\n반영 ${done}건.`);
  if (skipped.length) {
    console.log(`건너뜀(enum 미등록): ${skipped.join(", ")}`);
  }
}

main().then(() => process.exit(0));
