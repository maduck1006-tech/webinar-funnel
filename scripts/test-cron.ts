/**
 * 리마인더/유도 크론 로직 테스트 (B.4 / B.5)
 * 사전 조건: `npm run dev` 실행 중, CRON_SECRET 세팅(없으면 인증 생략됨)
 * 실행: npm run test:cron
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { leads, messageLogs, orders } from "../src/db/schema";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const H = 3600 * 1000;
const ago = (h: number) => new Date(Date.now() - h * H);

let pass = 0;
let fail = 0;
function check(n: string, ok: boolean, d?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${n}`);
  } else {
    fail++;
    console.log(`  ❌ ${n}`, d ?? "");
  }
}

async function mkLead(o: {
  hAgo: number;
  watchedHAgo?: number;
  status: typeof leads.$inferSelect.status;
}) {
  const created = ago(o.hAgo);
  const [l] = await db
    .insert(leads)
    .values({
      email: `cron.${Date.now()}.${Math.random().toString(36).slice(2)}@ex.com`,
      phone: "010" + String(Date.now()).slice(-8),
      status: o.status,
      createdAt: created,
      firstWatchedAt: o.watchedHAgo != null ? ago(o.watchedHAgo) : null,
      vodExpiresAt: new Date(created.getTime() + 48 * H),
    })
    .returning();
  return l;
}

const triggersOf = async (leadId: string) =>
  (
    await db
      .select({ t: messageLogs.trigger })
      .from(messageLogs)
      .where(eq(messageLogs.leadId, leadId))
  ).map((r) => r.t);

async function main() {
  const a = await mkLead({ hAgo: 25, status: "applied" }); // → reminder_24h
  const b = await mkLead({ hAgo: 37, status: "applied" }); // → reminder_12h_left (24h는 건너뜀)
  const c = await mkLead({ hAgo: 49, status: "applied" }); // → 만료, 메시지 없음
  const d = await mkLead({ hAgo: 20, status: "applied" }); // → 아직 이르다, 없음
  const e = await mkLead({ hAgo: 40, watchedHAgo: 5, status: "watching" }); // → pre_payment_nudge
  const f = await mkLead({ hAgo: 40, watchedHAgo: 5, status: "watching" }); // 결제자 → nudge 없음
  await db.insert(orders).values({
    leadId: f.id,
    tossPaymentKey: `cron-paid-${Date.now()}`,
    amount: 9900,
    status: "success",
  });

  const res = await fetch(`${BASE}/api/cron/reminders`, {
    headers: process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  const body = await res.json();
  console.log("cron 응답:", body);
  check("크론 200", res.status === 200, res.status);

  check("A: reminder_24h 발송", (await triggersOf(a.id)).includes("reminder_24h"));
  const bt = await triggersOf(b.id);
  check("B: reminder_12h_left 발송", bt.includes("reminder_12h_left"), bt);
  check("B: reminder_24h 는 건너뜀(놓친 창)", !bt.includes("reminder_24h"), bt);

  const [cLead] = await db.select().from(leads).where(eq(leads.id, c.id));
  check("C: status=expired", cLead.status === "expired", cLead.status);
  check("C: 메시지 없음", (await triggersOf(c.id)).length === 0);

  check("D: 24h 미만 → 메시지 없음", (await triggersOf(d.id)).length === 0);

  check("E: pre_payment_nudge 발송", (await triggersOf(e.id)).includes("pre_payment_nudge"));
  check("F: 결제자 → nudge 없음", !(await triggersOf(f.id)).includes("pre_payment_nudge"));

  // 재실행 idempotency
  await fetch(`${BASE}/api/cron/reminders`, {
    headers: process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {},
  });
  check("A: 재실행해도 reminder_24h 1건", (await triggersOf(a.id)).filter((t) => t === "reminder_24h").length === 1);

  // 정리
  const ids = [a, b, c, d, e, f].map((l) => l.id);
  await db.delete(messageLogs).where(inArray(messageLogs.leadId, ids));
  await db.delete(orders).where(inArray(orders.leadId, ids));
  await db.delete(leads).where(inArray(leads.id, ids));

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
