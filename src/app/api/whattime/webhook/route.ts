import { NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, orders, webhookEvents } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { reportError } from "@/lib/report";
import { sendMetaEvent } from "@/lib/meta-capi";
import { enrollLeadInSequences } from "@/lib/sequences";

export const runtime = "nodejs";

/**
 * 되는시간(WhatTime) 웹훅 수신.
 * 되는시간 설정 → Webhooks 에 이 URL 등록 + kind: schedule_created / schedule_canceled
 *   {SITE}/api/whattime/webhook?token=WHATTIME_WEBHOOK_SECRET
 *
 * 예약 확정 → 이메일/전화 매칭되는 lead 를 'booked' 로.
 * 예약 취소 → 'booked' 였으면 되돌림(주문 있으면 purchased, 없으면 watched).
 */
type Schedule = {
  status?: string; // confirm | cancel
  email?: string;
  phone?: string;
  name?: string;
  start_at?: string;
  code?: string;
};

function extract(body: unknown): { kind: string; schedule: Schedule } {
  const b = (body ?? {}) as Record<string, unknown>;
  // 되는시간이 { kind, resource: Schedule } 또는 { kind, schedule } 또는 Schedule 직접 보낼 수 있음
  const kind = String(b.kind ?? "");
  const schedule = (b.resource ??
    b.schedule ??
    b.data ??
    b) as Schedule;
  return { kind, schedule };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.WHATTIME_WEBHOOK_SECRET;
  if (secret) {
    const token =
      url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
    if (token !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const raw = await req.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* keep null */
  }

  const { kind, schedule } = extract(body);
  const status = (schedule.status ?? "").toLowerCase();
  const canceled =
    kind === "schedule_canceled" || status === "cancel" || status === "canceled";
  const confirmed =
    kind === "schedule_created" || status === "confirm" || status === "confirmed";

  const [logRow] = await db
    .insert(webhookEvents)
    .values({
      provider: "whattime",
      type: kind || (confirmed ? "confirm" : canceled ? "cancel" : "unknown"),
      status: schedule.status ?? null,
      signatureValid: true,
      payload: (body ?? { raw }) as object,
    })
    .returning({ id: webhookEvents.id });

  try {
    const email = schedule.email?.trim().toLowerCase();
    const phone = normalizePhone(schedule.phone);
    if (!email && !phone) {
      await db
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: "no email/phone" })
        .where(eq(webhookEvents.id, logRow.id));
      return NextResponse.json({ ok: true, ignored: "no identifier" });
    }

    const [lead] = await db
      .select()
      .from(leads)
      .where(
        or(
          email ? eq(leads.email, email) : undefined,
          phone ? eq(leads.phone, phone) : undefined,
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(1);

    if (!lead) {
      await db
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: "lead not matched" })
        .where(eq(webhookEvents.id, logRow.id));
      return NextResponse.json({ ok: true, ignored: "lead not matched" });
    }

    if (confirmed) {
      if (["applied", "watching", "watched", "purchased"].includes(lead.status)) {
        await db
          .update(leads)
          .set({ status: "booked", updatedAt: new Date() })
          .where(eq(leads.id, lead.id));

        // Meta Conversions API — Schedule (상담 예약 확정)
        let pixelId: string | null | undefined;
        if (lead.campaignId) {
          const [c] = await db
            .select({ metaPixelId: campaigns.metaPixelId })
            .from(campaigns)
            .where(eq(campaigns.id, lead.campaignId));
          pixelId = c?.metaPixelId;
        }
        try {
          await sendMetaEvent({
            pixelId,
            eventName: "Schedule",
            eventId: `schedule.${schedule.code ?? lead.id}`,
            actionSource: "system_generated",
            eventSourceUrl: lead.landingUrl ?? undefined,
            user: {
              email: lead.email,
              phone: lead.phone,
              firstName: lead.name ?? undefined,
              fbc: lead.fbc,
              fbp: lead.fbp,
              clientIp: lead.clientIp,
              clientUa: lead.clientUa,
              externalId: lead.id,
            },
          });
        } catch {
          /* CApI 실패가 예약 처리를 막지 않음 */
        }

        try {
          await enrollLeadInSequences(
            lead.id,
            "booking",
            lead.campaignId ?? null,
          );
        } catch {
          /* 시퀀스 등록 실패 무시 */
        }
      }
    } else if (canceled && lead.status === "booked") {
      const [paid] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.leadId, lead.id), eq(orders.status, "success")))
        .limit(1);
      const revertTo = paid
        ? "purchased"
        : lead.firstWatchedAt
          ? "watched"
          : "applied";
      await db
        .update(leads)
        .set({ status: revertTo, updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, logRow.id));
    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (e) {
    reportError("whattime.webhook", e, { eventId: logRow.id });
    await db
      .update(webhookEvents)
      .set({ error: `processing: ${String(e)}` })
      .where(eq(webhookEvents.id, logRow.id));
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
