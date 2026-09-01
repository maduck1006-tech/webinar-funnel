import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads, messageLogs, orders } from "@/db/schema";
import {
  Card,
  PageHeader,
  STATUS_LABEL,
  Tag,
  fmtDate,
  statusTone,
  won,
} from "@/components/admin-ui";
import { ManualActions } from "./ManualActions";

export const dynamic = "force-dynamic";

export default async function CrmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lead: typeof leads.$inferSelect | undefined;
  let campaignName: string | null = null;
  let msgs: (typeof messageLogs.$inferSelect)[] = [];
  let ords: (typeof orders.$inferSelect)[] = [];
  try {
    [lead] = await db.select().from(leads).where(eq(leads.id, id));
    if (lead) {
      if (lead.campaignId) {
        const [c] = await db
          .select({ name: campaigns.name })
          .from(campaigns)
          .where(eq(campaigns.id, lead.campaignId));
        campaignName = c?.name ?? null;
      }
      msgs = await db
        .select()
        .from(messageLogs)
        .where(eq(messageLogs.leadId, id))
        .orderBy(desc(messageLogs.createdAt));
      ords = await db
        .select()
        .from(orders)
        .where(eq(orders.leadId, id))
        .orderBy(desc(orders.createdAt));
    }
  } catch {
    notFound();
  }
  if (!lead) notFound();

  const timeline = [
    { at: lead.createdAt, text: "DB 입력 (신청)" },
    ...(lead.firstWatchedAt
      ? [{ at: lead.firstWatchedAt, text: "VOD 시청 시작" }]
      : []),
    ...msgs.map((m) => ({
      at: m.sentAt ?? m.createdAt,
      text: `CRM 메시지 ${m.trigger} — ${m.status}`,
    })),
    ...ords.map((o) => ({
      at: o.paidAt ?? o.createdAt,
      text: `결제 ${o.status} — ${won(o.amount)}${o.orderRole !== "main" ? ` [${o.orderRole}]` : ""}`,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <PageHeader
        title="CRM 고객 상세"
        desc={
          <Link href="/admin/crm" className="text-blue-600 underline">
            ← 목록으로
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-bold">고객 정보</p>
            <p className="mt-2 text-sm">
              {lead.email} · {lead.phone}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {campaignName && <>캠페인 {campaignName} · </>}
              DB 입력 {fmtDate(lead.createdAt)} · 시청 만료{" "}
              {fmtDate(lead.vodExpiresAt)}
            </p>
            <p className="mt-2">
              <Tag tone={statusTone(lead.status)}>
                {STATUS_LABEL[lead.status]}
              </Tag>
            </p>
          </Card>

          <Card>
            <p className="mb-3 text-sm font-bold">타임라인</p>
            <ul className="space-y-2 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {fmtDate(t.at)}
                  </span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <p className="mb-3 text-sm font-bold">수동 조치</p>
          <ManualActions
            leadId={lead.id}
            statusOptions={Object.entries(STATUS_LABEL)}
            currentStatus={lead.status}
          />
        </Card>
      </div>
    </>
  );
}
