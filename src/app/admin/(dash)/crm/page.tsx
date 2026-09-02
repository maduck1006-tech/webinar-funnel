import Link from "next/link";
import { and, desc, eq, gte, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, leads } from "@/db/schema";
import {
  Card,
  EmptyRow,
  PageHeader,
  STATUS_LABEL,
  Tag,
  fmtDate,
  statusTone,
} from "@/components/admin-ui";
import { SectionTabs } from "../SectionTabs";
import { listCampaigns } from "@/lib/campaign";

export const dynamic = "force-dynamic";

const STATUSES = Object.keys(STATUS_LABEL);

export default async function CrmListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    days?: string;
    campaign?: string;
  }>;
}) {
  const { q, status, days, campaign } = await searchParams;
  const nowMs = new Date().getTime();
  const campaignOptions = await listCampaigns();

  let rows: {
    lead: typeof leads.$inferSelect;
    campaignName: string | null;
  }[] = [];
  let connected = true;
  try {
    const conds: (SQL | undefined)[] = [];
    if (q)
      conds.push(or(ilike(leads.email, `%${q}%`), ilike(leads.phone, `%${q}%`)));
    if (status && STATUSES.includes(status))
      conds.push(eq(leads.status, status as typeof leads.$inferSelect.status));
    if (campaign) conds.push(eq(leads.campaignId, campaign));
    if (days)
      conds.push(gte(leads.createdAt, new Date(nowMs - Number(days) * 86400000)));

    rows = await db
      .select({ lead: leads, campaignName: campaigns.name })
      .from(leads)
      .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(200);
  } catch {
    connected = false;
  }

  const exportQs = new URLSearchParams();
  if (status) exportQs.set("status", status);
  if (campaign) exportQs.set("campaign", campaign);

  return (
    <>
      <PageHeader title="CRM 고객 목록" desc="DB 입력자 전체 · 캠페인/상태/기간 필터" />

      <SectionTabs set="customer" />

      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">검색 (이메일/연락처)</span>
            <input
              name="q"
              defaultValue={q}
              className="mt-1 w-56 rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">캠페인</span>
            <select
              name="campaign"
              defaultValue={campaign ?? ""}
              className="mt-1 rounded border px-2 py-1"
            >
              <option value="">전체</option>
              {campaignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isDefault ? " (기본)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">상태</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="mt-1 rounded border px-2 py-1"
            >
              <option value="">전체</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">기간</span>
            <select
              name="days"
              defaultValue={days ?? ""}
              className="mt-1 rounded border px-2 py-1"
            >
              <option value="">전체</option>
              <option value="1">최근 1일</option>
              <option value="7">최근 7일</option>
              <option value="30">최근 30일</option>
            </select>
          </label>
          <button className="rounded-lg bg-black px-4 py-1.5 font-semibold text-white">
            조회
          </button>
          <a
            href={`/api/crm/export${exportQs.toString() ? `?${exportQs}` : ""}`}
            className="rounded-lg border px-4 py-1.5"
          >
            CSV 내보내기
          </a>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        {!connected && <p className="mb-2 text-sm text-amber-600">DB 미연결</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="pb-2">이메일</th>
              <th className="pb-2">연락처</th>
              <th className="pb-2">캠페인</th>
              <th className="pb-2">DB 입력</th>
              <th className="pb-2">상태</th>
              <th className="pb-2">시청 만료</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && <EmptyRow colSpan={6} text="고객 없음" />}
            {rows.map(({ lead: r, campaignName }) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="py-2">
                  <Link
                    href={`/admin/crm/${r.id}`}
                    className="text-blue-600 underline"
                  >
                    {r.email}
                  </Link>
                </td>
                <td className="py-2">{r.phone}</td>
                <td className="py-2 text-xs text-zinc-500">
                  {campaignName ?? "—"}
                </td>
                <td className="py-2 text-zinc-500">{fmtDate(r.createdAt)}</td>
                <td className="py-2">
                  <Tag tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Tag>
                </td>
                <td className="py-2 text-zinc-500">{fmtDate(r.vodExpiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
