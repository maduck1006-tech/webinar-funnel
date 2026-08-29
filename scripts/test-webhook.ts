/**
 * 래피드 결제 웹훅 E2E 테스트 (B.2)
 * 사전 조건: `npm run dev` 실행 중, .env.local 에 LATPEED_WEBHOOK_SECRET / DATABASE_URL 세팅
 *
 * 실행: npm run test:webhook
 *  1) 테스트 lead 생성 (이메일 대소문자 섞어서 매칭 검증)
 *  2) 서명된 SUCCESS 웹훅 전송 → order 생성 / lead.status=purchased / payment_success 메시지 로그 확인
 *  3) 서명된 CANCEL 웹훅 전송 → order.status=cancel / lead.status=no_purchase 확인
 *  4) 잘못된 서명 → 200 이지만 처리 안 됨(signature_valid=false) 확인
 */
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { leads, messageLogs, orders, webhookEvents } from "../src/db/schema";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.LATPEED_WEBHOOK_SECRET ?? "test-secret";

function sign(rawBody: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  return { ts, sig };
}

async function post(payload: object, opts: { badSig?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const { ts, sig } = sign(raw);
  const res = await fetch(`${BASE}/api/latpeed/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-latpeed-timestamp": ts,
      "x-latpeed-signature": opts.badSig ? "deadbeef" : sig,
    },
    body: raw,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}`, detail ?? "");
  }
}

async function main() {
  const stamp = Date.now();
  const email = `Test.${stamp}@Example.com`; // 대문자 포함
  const phone = "010-9999-" + String(stamp).slice(-4);
  const orderId = `TEST-${stamp}`;

  const [lead] = await db
    .insert(leads)
    .values({
      email: email.toLowerCase(),
      phone: phone.replace(/\D/g, ""),
      vodExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    })
    .returning();
  console.log(`lead 생성: ${lead.id} (${email} / ${phone})`);

  // --- SUCCESS ---
  const success = await post({
    type: "NORMAL_PAYMENT",
    payment: {
      orderId,
      email, // 대문자 그대로 → 매칭돼야 함
      phoneNumber: "+8210" + phone.replace(/\D/g, "").slice(-8),
      amount: 9900,
      status: "SUCCESS",
      method: "CARD",
      date: new Date().toISOString(),
    },
  });
  check("SUCCESS 응답 200/ok", success.status === 200 && success.body?.ok === true, success);

  const [ord] = await db
    .select()
    .from(orders)
    .where(eq(orders.latpeedOrderId, orderId));
  check("order 생성됨", !!ord);
  check("order.status = success", ord?.status === "success", ord?.status);
  check("order.leadId 매칭 (이메일 대소문자 무시)", ord?.leadId === lead.id, ord?.leadId);

  const [leadAfter] = await db.select().from(leads).where(eq(leads.id, lead.id));
  check("lead.status = purchased", leadAfter?.status === "purchased", leadAfter?.status);

  const [msg] = await db
    .select()
    .from(messageLogs)
    .where(
      and(
        eq(messageLogs.leadId, lead.id),
        eq(messageLogs.trigger, "payment_success"),
      ),
    );
  check("payment_success 메시지 로그 존재", !!msg, msg?.status);

  // 중복 수신 idempotency
  await post({
    type: "NORMAL_PAYMENT",
    payment: { orderId, email, phoneNumber: phone, amount: 9900, status: "SUCCESS" },
  });
  const dupOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.latpeedOrderId, orderId));
  check("중복 웹훅 → order 1건 유지", dupOrders.length === 1, dupOrders.length);

  // --- CANCEL ---
  const cancel = await post({
    type: "NORMAL_PAYMENT",
    payment: { orderId, email, phoneNumber: phone, amount: 9900, status: "CANCEL" },
  });
  check("CANCEL 응답 200", cancel.status === 200, cancel);
  const [ordC] = await db
    .select()
    .from(orders)
    .where(eq(orders.latpeedOrderId, orderId));
  check("order.status = cancel", ordC?.status === "cancel", ordC?.status);
  const [leadC] = await db.select().from(leads).where(eq(leads.id, lead.id));
  check("lead.status = no_purchase (회수)", leadC?.status === "no_purchase", leadC?.status);

  // --- BAD SIGNATURE ---
  const bad = await post(
    {
      type: "NORMAL_PAYMENT",
      payment: { orderId: `${orderId}-bad`, email, phoneNumber: phone, amount: 1, status: "SUCCESS" },
    },
    { badSig: true },
  );
  check("잘못된 서명도 200 (재시도 폭주 방지)", bad.status === 200, bad);
  const [badEv] = await db
    .select()
    .from(webhookEvents)
    .orderBy(desc(webhookEvents.createdAt))
    .limit(1);
  check("잘못된 서명 → signature_valid=false 로 로깅", badEv?.signatureValid === false, badEv?.signatureValid);
  const badOrder = await db
    .select()
    .from(orders)
    .where(eq(orders.latpeedOrderId, `${orderId}-bad`));
  check("잘못된 서명 → order 미생성", badOrder.length === 0, badOrder.length);

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
