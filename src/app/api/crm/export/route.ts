import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads } from "@/db/schema";
import { STATUS_LABEL } from "@/components/admin-ui";

export const dynamic = "force-dynamic";

// TODO(P2): Clerk 관리자 인증 (지금은 middleware Basic Auth)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const campaign = sp.get("campaign");

  const conds: (SQL | undefined)[] = [];
  if (status && status in STATUS_LABEL)
    conds.push(eq(leads.status, status as typeof leads.$inferSelect.status));
  if (campaign) conds.push(eq(leads.campaignId, campaign));

  const rows = await db
    .select({
      email: leads.email,
      phone: leads.phone,
      name: leads.name,
      status: leads.status,
      campaign: campaigns.name,
      createdAt: leads.createdAt,
      vodExpiresAt: leads.vodExpiresAt,
      utm: leads.utm,
    })
    .from(leads)
    .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leads.createdAt));

  const header = [
    "name",
    "email",
    "phone",
    "campaign",
    "status",
    "utm_source",
    "utm_campaign",
    "created_at",
    "vod_expires_at",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.name ?? "",
        r.email,
        r.phone,
        r.campaign ?? "",
        STATUS_LABEL[r.status],
        r.utm?.utm_source ?? "",
        r.utm?.utm_campaign ?? "",
        r.createdAt.toISOString(),
        r.vodExpiresAt.toISOString(),
      ]
        .map((v) => (String(v).includes(",") ? `"${v}"` : v))
        .join(","),
    ),
  ].join("\n");

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads.csv"`,
    },
  });
}
