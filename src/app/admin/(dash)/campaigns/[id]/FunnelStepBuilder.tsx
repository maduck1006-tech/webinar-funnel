import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignPages, type Campaign } from "@/db/schema";
import { Card, Tag } from "@/components/admin-ui";
import { campaignBasePath } from "@/lib/campaign";
import {
  ADDABLE_STEPS,
  flowSummary,
  resolveFlowSteps,
  STEP_META,
  suggestNextStep,
} from "@/lib/funnel-flow";
import { setFlowStep } from "../actions";

function FlowBtn({
  campaignId,
  pageType,
  op,
  label,
  danger,
}: {
  campaignId: string;
  pageType: string;
  op: "up" | "down" | "remove";
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={setFlowStep}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="pageType" value={pageType} />
      <input type="hidden" name="op" value={op} />
      <button
        className={`rounded-md border px-2 py-1.5 text-xs ${
          danger ? "text-red-500" : "text-zinc-500"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

export async function FunnelStepBuilder({ campaign }: { campaign: Campaign }) {
  const id = campaign.id;
  const basePath = campaignBasePath(campaign);

  const pages = await db
    .select({ pageType: campaignPages.pageType, version: campaignPages.version })
    .from(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, id),
        eq(campaignPages.published, true),
      ),
    )
    .catch(() => []);
  const pubMap = new Map(pages.map((p) => [String(p.pageType), p]));

  const steps = resolveFlowSteps(campaign);
  const enabled = steps.filter((s) => s.enabled);
  const disabled = ADDABLE_STEPS.filter(
    (pt) => !steps.some((s) => s.pageType === pt && s.enabled),
  );
  const suggested = suggestNextStep(campaign);
  const extras = disabled.filter((pt) => pt !== suggested);

  const addForm = (pt: string, cls: string, label: string) => (
    <form action={setFlowStep}>
      <input type="hidden" name="campaignId" value={id} />
      <input type="hidden" name="pageType" value={pt} />
      <input type="hidden" name="op" value="add" />
      <button className={cls}>{label}</button>
    </form>
  );

  const stepRow = (pageType: string, i: number) => {
    const meta = STEP_META[pageType];
    if (!meta) return null;
    const pub = pubMap.get(pageType);
    return (
      <li
        key={pageType}
        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
      >
        <span className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500">
            {i + 1}
          </span>
          {meta.title}
          {meta.puck &&
            (pub ? (
              <span className="text-xs text-zinc-400">v{pub.version} 발행</span>
            ) : (
              <Tag tone="amber">미발행</Tag>
            ))}
          {meta.note && (
            <span className="text-[11px] text-zinc-400">{meta.note}</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <FlowBtn campaignId={id} pageType={pageType} op="up" label="▲" />
          <FlowBtn campaignId={id} pageType={pageType} op="down" label="▼" />
          {meta.puck && (
            <Link
              href={`/admin/builder/${id}/${pageType}`}
              className="rounded-md bg-black px-3 py-1.5 text-xs text-white"
            >
              편집
            </Link>
          )}
          <a
            href={`${basePath}${meta.path}?preview=1`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            미리보기
          </a>
          <FlowBtn
            campaignId={id}
            pageType={pageType}
            op="remove"
            label="빼기"
            danger
          />
        </span>
      </li>
    );
  };

  return (
    <Card>
      <p className="mb-1 text-sm font-bold">퍼널 흐름</p>
      <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-600">
        {flowSummary(steps) || "사용 중인 단계 없음"}
      </p>

      <p className="mb-1 mt-4 text-xs font-semibold text-zinc-500">
        사용 중인 단계 (순서대로)
      </p>
      <ul className="divide-y">
        {enabled.length === 0 && (
          <li className="py-3 text-xs text-zinc-400">
            아래에서 단계를 추가하세요.
          </li>
        )}
        {enabled.map((s, i) => stepRow(s.pageType, i))}
      </ul>

      {suggested ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-blue-700">
              다음 단계로 이걸 추가하세요
            </p>
            <p className="text-sm font-bold text-blue-900">
              {STEP_META[suggested]?.title ?? suggested}
            </p>
          </div>
          {addForm(
            suggested,
            "shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white",
            "+ 추가",
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          ✓ 이 퍼널에 필요한 단계가 다 있어요.
        </p>
      )}

      {extras.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-500">
            다른 단계도 추가 ({extras.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {extras.map((pt) => (
              <div key={pt}>
                {addForm(
                  pt,
                  "rounded-lg border border-dashed px-3 py-1.5 text-xs text-zinc-600 hover:border-solid hover:bg-zinc-50",
                  `+ ${STEP_META[pt].title}`,
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
