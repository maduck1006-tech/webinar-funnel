import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { Card, PageHeader } from "@/components/admin-ui";
import { FUNNEL_TEMPLATES } from "@/lib/funnel-templates";
import { createCampaign } from "../actions";
import { SlugFields } from "./SlugFields";
import { TemplatePicker } from "./TemplatePicker";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  let sources: (typeof campaigns.$inferSelect)[] = [];
  try {
    sources = await db.select().from(campaigns).orderBy(asc(campaigns.name));
  } catch {
    /* db 미연결 */
  }

  const templates = FUNNEL_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    tagline: t.tagline,
    icon: t.icon,
    steps: t.steps.length,
    automations: t.automations.length,
    slots: t.productSlots.length,
  }));

  return (
    <>
      <PageHeader
        title="새 캠페인"
        desc="퍼널 형태를 고르면 단계 · 페이지 · 자동 메시지(꺼짐)가 한 번에 만들어집니다."
      />
      <Card className="max-w-2xl">
        <form action={createCampaign} className="space-y-5 text-sm">
          <TemplatePicker templates={templates} />

          <div className="space-y-3 border-t pt-4">
            <SlugFields />
          </div>

          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer">
              또는 기존 캠페인 복제 (설정·페이지·상품 매핑까지)
            </summary>
            <select
              name="sourceId"
              className="mt-2 w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">사용 안 함</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isTemplate ? " (템플릿)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1">복제를 선택하면 위 템플릿은 무시됩니다.</p>
          </details>

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
