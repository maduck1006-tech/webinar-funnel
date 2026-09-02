import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, campaigns, products } from "@/db/schema";
import { Card, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import { resolveFlowSteps, STEP_META } from "@/lib/funnel-flow";
import { makeDefault } from "./actions";
import {
  ArchiveCampaignButton,
  DeleteCampaignButton,
  EditableName,
} from "./row-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  live: "green",
  draft: "amber",
  archived: "gray",
} as const;

const FUNNEL_TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  evergreen_webinar: { label: "에버그린 무료강의", icon: "♾️" },
  live_webinar_reg: { label: "라이브 웨비나 신청", icon: "🔴" },
  vod_course: { label: "VOD 강의 판매", icon: "🎬" },
  ebook: { label: "전자책 판매", icon: "📕" },
  paid_consult: { label: "유료 상담", icon: "🗓️" },
};

/** 캠페인의 단계 흐름을 칩으로 (랜딩 → 땡큐 → VOD → 상담) */
function FlowChips({
  campaign,
}: {
  campaign: typeof campaigns.$inferSelect;
}) {
  const steps = resolveFlowSteps(campaign);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.pageType} className="flex items-center gap-1.5">
          {s.enabled ? (
            <Tag tone="blue">{STEP_META[s.pageType]?.title ?? s.pageType}</Tag>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[11px] text-zinc-500 line-through">
              {STEP_META[s.pageType]?.title ?? s.pageType}
            </span>
          )}
          {i < steps.length - 1 && (
            <span className="text-[10px] text-zinc-400">→</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default async function CampaignsPage() {
  let list: (typeof campaigns.$inferSelect)[] = [];
  const productCount = new Map<string, number>();
  try {
    list = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    const cps = await db
      .select({ campaignId: campaignProducts.campaignId, name: products.name })
      .from(campaignProducts)
      .innerJoin(products, eq(products.id, campaignProducts.productId));
    for (const cp of cps) {
      productCount.set(
        cp.campaignId,
        (productCount.get(cp.campaignId) ?? 0) + 1,
      );
    }
  } catch {
    /* db 미연결 */
  }

  return (
    <>
      <PageHeader
        title="캠페인"
        desc="캠페인 = 퍼널 한 벌(랜딩페이지 세트). 새 캠페인은 템플릿에서 복제해 만듭니다."
        actions={
          <Link
            href="/admin/campaigns/new"
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            + 새 캠페인
          </Link>
        }
      />

      <div className="space-y-3">
        {list.length === 0 && (
          <Card>
            <p className="py-8 text-center text-sm text-zinc-400">
              캠페인이 없습니다.
            </p>
          </Card>
        )}

        {list.map((c) => {
          const ft = FUNNEL_TYPE_LABEL[c.funnelType] ?? {
            label: c.funnelType,
            icon: "📄",
          };
          const nProducts = productCount.get(c.id) ?? 0;
          return (
            <Card
              key={c.id}
              className={c.isTemplate ? "border-dashed opacity-80" : ""}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* 왼쪽: 이름 + 메타 */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900">
                      <EditableName
                        id={c.id}
                        name={c.name}
                        isTemplate={c.isTemplate}
                      />
                    </span>
                    <Tag tone={STATUS_TONE[c.status]}>{c.status}</Tag>
                    {c.isDefault && <Tag tone="green">기본</Tag>}
                    {c.isTemplate && <Tag tone="gray">템플릿</Tag>}
                    {c.abLanding && <Tag tone="blue">A/B</Tag>}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>
                      {ft.icon} <b className="text-zinc-700">{ft.label}</b>
                    </span>
                    <span className="font-mono">
                      {c.isDefault ? "/" : `/${c.slug}`}
                    </span>
                    <span>상품 {nProducts}개 연결</span>
                    <span>
                      추적{" "}
                      {c.metaPixelId ? (
                        <b className="text-green-600">픽셀 O</b>
                      ) : (
                        <span className="text-amber-600">픽셀 X</span>
                      )}
                    </span>
                    <span>{fmtDate(c.createdAt)} 생성</span>
                  </div>

                  {/* 단계 흐름 */}
                  <div className="pt-1">
                    <FlowChips campaign={c} />
                  </div>
                </div>

                {/* 오른쪽: 액션 */}
                <div className="flex shrink-0 items-center gap-3 border-t pt-3 sm:border-0 sm:pt-0">
                  {!c.isDefault && !c.isTemplate && (
                    <form action={makeDefault}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-zinc-500 underline">
                        기본으로
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/campaigns/${c.id}`}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    관리
                  </Link>
                  {!c.isDefault && (
                    <Link
                      href={c.isDefault ? "#" : `/${c.slug}`}
                      target="_blank"
                      className="text-xs text-zinc-400 underline"
                    >
                      미리보기
                    </Link>
                  )}
                  <ArchiveCampaignButton
                    id={c.id}
                    name={c.name}
                    archived={c.status === "archived"}
                    disabled={c.isDefault || c.isTemplate}
                  />
                  <DeleteCampaignButton
                    id={c.id}
                    name={c.name}
                    disabled={c.isDefault || c.isTemplate}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
