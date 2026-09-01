import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { Card, PageHeader } from "@/components/admin-ui";
import { createCampaign } from "../actions";
import { SlugFields } from "./SlugFields";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  let sources: (typeof campaigns.$inferSelect)[] = [];
  try {
    sources = await db.select().from(campaigns).orderBy(asc(campaigns.name));
  } catch {
    /* db 미연결 */
  }

  return (
    <>
      <PageHeader
        title="새 캠페인"
        desc="템플릿 또는 기존 캠페인을 복제해 시작합니다. 페이지 4개 + 상품 매핑 + 설정이 복사됩니다."
      />
      <Card className="max-w-lg">
        <form action={createCampaign} className="space-y-3 text-sm">
          <SlugFields />
          <label className="block">
            <span className="text-xs text-zinc-500">복제 원본</span>
            <select
              name="sourceId"
              className="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="">빈 캠페인 (기본 구성)</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isTemplate ? " (템플릿)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 pt-1">
            <button className="rounded-lg bg-black px-4 py-2 font-semibold text-white">
              생성
            </button>
            <Link
              href="/admin/campaigns"
              className="rounded-lg border px-4 py-2 text-zinc-500"
            >
              취소
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
