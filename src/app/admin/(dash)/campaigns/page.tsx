import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { Card, EmptyRow, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { makeDefault } from "./actions";
import { DeleteCampaignButton, EditableName } from "./row-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  live: "green",
  draft: "amber",
  archived: "gray",
} as const;

export default async function CampaignsPage() {
  let list: (typeof campaigns.$inferSelect)[] = [];
  try {
    list = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  } catch {
    /* db 미연결 */
  }

  return (
    <>
      <PageHeader
        title="캠페인"
        desc="웨비나 오퍼(랜딩페이지 세트) 목록. 새 캠페인은 템플릿에서 복제해 만듭니다."
        actions={
          <Link
            href="/admin/campaigns/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            + 새 캠페인
          </Link>
        }
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-zinc-500">
              <th className="pb-2">이름</th>
              <th className="pb-2">URL</th>
              <th className="pb-2">상태</th>
              <th className="pb-2">기본</th>
              <th className="pb-2">생성</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.length === 0 && (
              <EmptyRow colSpan={6} text="캠페인 없음 (마이그레이션 필요)" />
            )}
            {list.map((c) => (
              <tr key={c.id}>
                <td className="py-2 font-medium">
                  <EditableName
                    id={c.id}
                    name={c.name}
                    isTemplate={c.isTemplate}
                  />
                </td>
                <td className="py-2 font-mono text-xs text-zinc-500">
                  {c.isDefault ? "/" : `/${c.slug}`}
                </td>
                <td className="py-2">
                  <Tag tone={STATUS_TONE[c.status]}>{c.status}</Tag>
                </td>
                <td className="py-2">
                  {c.isDefault ? (
                    <Tag tone="green">기본</Tag>
                  ) : (
                    !c.isTemplate && (
                      <form action={makeDefault} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-zinc-500 underline">
                          기본으로
                        </button>
                      </form>
                    )
                  )}
                </td>
                <td className="py-2 text-xs text-zinc-500">
                  {fmtDate(c.createdAt)}
                </td>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/campaigns/${c.id}`}
                      className="text-xs text-blue-600 underline"
                    >
                      관리
                    </Link>
                    <DeleteCampaignButton
                      id={c.id}
                      name={c.name}
                      disabled={c.isDefault || c.isTemplate}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
