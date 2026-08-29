import { db } from "../src/db";
import {
  automationTriggers,
  leads,
  messageLogs,
  orders,
  products,
  webhookEvents,
} from "../src/db/schema";

const h = (n: number) => n * 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

async function main() {
  console.log("seeding...");

  await db.delete(messageLogs);
  await db.delete(orders);
  await db.delete(webhookEvents);
  await db.delete(leads);
  await db.delete(products);
  await db.delete(automationTriggers);

  await db.insert(automationTriggers).values([
    { key: "reminder_24h", label: "DB 입력 +24h", condition: "미시청", offsetHours: 24, template: "{이름}님, 강의 시청 마감까지 24시간 남았습니다. {링크}" },
    { key: "reminder_12h_left", label: "DB 입력 +36h", condition: "미시청", offsetHours: 36, template: "마감 12시간 전! {링크}" },
    { key: "reminder_1h_left", label: "DB 입력 +47h", condition: "미시청", offsetHours: 47, template: "마지막 1시간입니다. {링크}" },
    { key: "pre_payment_nudge", label: "결제 직전 유도", condition: "저가 상품 미결제", offsetHours: null, template: "지금 {상품명}을 함께 보세요. {링크}" },
    { key: "payment_success", label: "래피드 웹훅 SUCCESS", condition: "결제 성공", offsetHours: null, template: "결제 완료! 상담 예약 안내 {링크}" },
    { key: "payment_cancel_admin", label: "래피드 웹훅 CANCEL", condition: "결제 취소", offsetHours: null, enabled: false, template: "[관리자] 결제 취소 발생" },
  ]);

  const [pA] = await db
    .insert(products)
    .values([
      { name: "워크북 패키지 A", price: 9500, compareAtPrice: 19000, active: true, latpeedProductId: "prod_1029", placement: "both" },
      { name: "워크북 패키지 B (프로모션)", price: 19000, compareAtPrice: 29000, active: false, latpeedProductId: "prod_1030", showUntil: new Date("2026-08-31"), placement: "thankyou" },
    ])
    .returning();

  const win = h(48);
  const seedLeads = [
    { email: "kim@example.com", phone: "01012340001", status: "purchased" as const, created: ago(h(50)), watched: ago(h(30)) },
    { email: "lee@example.com", phone: "01012340002", status: "watching" as const, created: ago(h(20)), watched: ago(h(5)) },
    { email: "park@example.com", phone: "01012340003", status: "expired" as const, created: ago(h(60)), watched: null },
    { email: "choi@example.com", phone: "01012340004", status: "booked" as const, created: ago(h(70)), watched: ago(h(40)) },
    { email: "jung@example.com", phone: "01012340005", status: "applied" as const, created: ago(h(3)), watched: null },
    { email: "kang@example.com", phone: "01012340006", status: "consulted" as const, created: ago(h(120)), watched: ago(h(100)) },
    { email: "yoon@example.com", phone: "01012340007", status: "applied" as const, created: ago(h(26)), watched: null },
    { email: "lim@example.com", phone: "01012340008", status: "no_purchase" as const, created: ago(h(90)), watched: ago(h(80)) },
  ];

  const inserted = await db
    .insert(leads)
    .values(
      seedLeads.map((l) => ({
        email: l.email,
        phone: l.phone,
        status: l.status,
        createdAt: l.created,
        firstWatchedAt: l.watched,
        vodExpiresAt: new Date(l.created.getTime() + win),
      })),
    )
    .returning();

  const kim = inserted[0];
  const choi = inserted[3];

  await db.insert(orders).values([
    { leadId: kim.id, productId: pA.id, latpeedOrderId: "A1029", email: kim.email, phone: kim.phone, amount: 19000, status: "success", method: "CARD", paidAt: ago(h(28)) },
    { leadId: choi.id, productId: pA.id, latpeedOrderId: "A1030", email: choi.email, phone: choi.phone, amount: 9500, status: "cancel", method: "CARD", paidAt: ago(h(38)) },
    { latpeedOrderId: "A1031", email: "ghost@example.com", phone: "01099998888", amount: 9500, status: "webhook_missing" },
  ]);

  await db.insert(webhookEvents).values([
    { type: "NORMAL_PAYMENT", status: "SUCCESS", signatureValid: true, payload: { payment: { orderId: "A1029" } }, processedAt: ago(h(28)) },
    { type: "NORMAL_PAYMENT", status: "CANCEL", signatureValid: true, payload: { payment: { orderId: "A1030" } }, processedAt: ago(h(38)) },
    { type: null, status: null, signatureValid: false, payload: { raw: "bad" }, error: "signature: mismatch" },
  ]);

  await db.insert(messageLogs).values([
    { leadId: kim.id, trigger: "reminder_24h", status: "sent", sentAt: ago(h(26)) },
    { leadId: kim.id, trigger: "payment_success", status: "sent", sentAt: ago(h(27)) },
    { leadId: inserted[6].id, trigger: "reminder_24h", status: "sent", sentAt: ago(h(2)) },
    { leadId: inserted[2].id, trigger: "reminder_1h_left", status: "failed", error: "수신거부" },
  ]);

  console.log("done:", { leads: inserted.length });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
