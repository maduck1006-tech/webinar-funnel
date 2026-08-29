import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, orders, webhookEvents } from "@/db/schema";
import {
  Card,
  EmptyRow,
  PageHeader,
  Tag,
  fmtDate,
  won,
} from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import { correctOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign } = await searchParams;
  const campaignOptions = await listCampaigns();

  let ords: {
    order: typeof orders.$inferSelect;
    campaignName: string | null;
  }[] = [];
  let hooks: (typeof webhookEvents.$inferSelect)[] = [];
  let connected = true;
  try {
    ords = await db
      .select({ order: orders, campaignName: campaigns.name })
      .from(orders)
      .leftJoin(campaigns, eq(campaigns.id, orders.campaignId))
      .where(campaign ? eq(orders.campaignId, campaign) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(100);
    hooks = await db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(20);
  } catch {
    connected = false;
  }

  return (
    <>
      <PageHeader
        title="결제 / 주문 관리"
        desc="래피드 웹훅 수신 내역 · 서명검증 · 웹훅 누락 시 수동 보정"
        actions={<CampaignFilter options={campaignOptions} />}
      />
      {!connected && <p className="mb-4 text-sm text-amber-600">DB 미연결</p>}

      <Card className="mb-6 overflow-x-auto">
        <p className="mb-3 text-sm font-bold">주문</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="pb-2">주문ID</th>
              <th className="pb-2">연락처</th>
              <th className="pb-2">캠페인</th>
              <th className="pb-2">금액</th>
              <th className="pb-2">상태</th>
              <th className="pb-2">결제일</th>
              <th className="pb-2">수동 보정</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ords.length === 0 && <EmptyRow colSpan={7} text="주문 없음" />}
            {ords.map(({ order: o, campaignName }) => (
              <tr key={o.id}>
                <td className="py-2 font-mono text-xs">{o.latpeedOrderId}</td>
                <td className="py-2">{o.phone ?? o.email ?? "—"}</td>
                <td className="py-2 text-xs text-zinc-500">
                  {campaignName ?? "—"}
                </td>
                <td className="py-2">{won(o.amount)}</td>
                <td className="py-2">
                  <Tag
                    tone={
                      o.status === "success"
                        ? "green"
                        : o.status === "cancel"
                          ? "red"
                          : "amber"
                    }
                  >
                    {o.status === "success"
                      ? "성공"
                      : o.status === "cancel"
                        ? "취소"
                        : "웹훅누락"}
                  </Tag>
                </td>
                <td className="py-2 text-zinc-500">{fmtDate(o.paidAt)}</td>
                <td className="py-2">
                  <form action={correctOrder} className="flex gap-1">
                    <input type="hidden" name="id" value={o.id} />
                    <select
                      name="status"
                      defaultValue={o.status}
                      className="rounded border px-1 py-0.5 text-xs"
                    >
                      <option value="success">성공</option>
                      <option value="cancel">취소</option>
                      <option value="webhook_missing">웹훅누락</option>
                    </select>
                    <button className="rounded border px-2 text-xs">적용</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <p className="mb-3 text-sm font-bold">웹훅 원본 로그</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="pb-2">수신</th>
              <th className="pb-2">type / status</th>
              <th className="pb-2">서명검증</th>
              <th className="pb-2">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {hooks.length === 0 && <EmptyRow colSpan={4} text="수신된 웹훅 없음" />}
            {hooks.map((h) => (
              <tr key={h.id}>
                <td className="py-2 text-zinc-500">{fmtDate(h.createdAt)}</td>
                <td className="py-2">
                  {h.type ?? "—"} / {h.status ?? "—"}
                </td>
                <td className="py-2">
                  <Tag tone={h.signatureValid ? "green" : "red"}>
                    {h.signatureValid ? "✔ 서명일치" : "✗ 불일치"}
                  </Tag>
                </td>
                <td className="py-2 text-xs text-zinc-500">
                  {h.processedAt ? fmtDate(h.processedAt) : h.error ?? "미처리"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
