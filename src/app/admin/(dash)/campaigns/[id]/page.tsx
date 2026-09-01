import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignPages, campaigns, leads, orders } from "@/db/schema";
import { Card, PageHeader, Stat, Tag, won } from "@/components/admin-ui";
import { campaignBasePath } from "@/lib/campaign";
import {
  ADDABLE_STEPS,
  flowSummary,
  resolveFlowSteps,
  STEP_META,
} from "@/lib/funnel-flow";
import {
  endAbTest,
  setCampaignStatus,
  setFlowStep,
  startAbTest,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignHub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id));
  if (!campaign) notFound();

  const basePath = campaignBasePath(campaign);

  const [m] = await db
    .select({
      leads: sql<number>`count(*)`,
      watched: sql<number>`count(*) filter (where ${leads.firstWatchedAt} is not null)`,
    })
    .from(leads)
    .where(eq(leads.campaignId, id));
  const [o] = await db
    .select({
      n: sql<number>`count(*) filter (where ${orders.status} = 'success')`,
      revenue: sql<number>`coalesce(sum(${orders.amount}) filter (where ${orders.status} = 'success'), 0)`,
    })
    .from(orders)
    .where(eq(orders.campaignId, id));

  const pages = await db
    .select({
      pageType: campaignPages.pageType,
      variant: campaignPages.variant,
      published: campaignPages.published,
      version: campaignPages.version,
    })
    .from(campaignPages)
    .where(and(eq(campaignPages.campaignId, id), eq(campaignPages.published, true)));
  const pubMap = new Map(
    pages.filter((p) => p.variant === "a").map((p) => [p.pageType, p]),
  );

  // A/B: 변형별 신청/구매
  const abRows = campaign.abLanding
    ? await db
        .select({
          v: leads.landingVariant,
          n: sql<number>`count(*)`,
          purchased: sql<number>`count(*) filter (where ${leads.status} in ('purchased','booked','consulted'))`,
        })
        .from(leads)
        .where(eq(leads.campaignId, id))
        .groupBy(leads.landingVariant)
        .catch(() => [])
    : [];
  const abStat = (v: "a" | "b") => {
    const r = abRows.find((x) => x.v === v);
    const n = Number(r?.n ?? 0);
    const p = Number(r?.purchased ?? 0);
    return { n, p, rate: n ? Math.round((p / n) * 100) : 0 };
  };

  return (
    <>
      <PageHeader
        title={campaign.name}
        desc={
          <span className="flex items-center gap-2">
            <code className="text-xs">{basePath || "/"}</code>
            <Tag tone={campaign.status === "live" ? "green" : "amber"}>
              {campaign.status}
            </Tag>
            {campaign.isDefault && <Tag tone="green">기본</Tag>}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Link
              href={`/admin/campaigns/${id}/settings`}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              설정
            </Link>
            <Link
              href={`/admin/flow?campaign=${campaign.slug}`}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              흐름도
            </Link>
            <Link
              href={`/admin/automation?campaign=${id}`}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              문자 문구
            </Link>
            <form action={setCampaignStatus}>
              <input type="hidden" name="id" value={id} />
              <input
                type="hidden"
                name="status"
                value={campaign.status === "live" ? "draft" : "live"}
              />
              <button className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white">
                {campaign.status === "live" ? "비공개로" : "발행(live)"}
              </button>
            </form>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="신청" value={`${Number(m?.leads ?? 0)}건`} />
        <Stat
          label="시청 시작"
          value={`${Number(m?.watched ?? 0)}건`}
        />
        <Stat label="저가 구매" value={`${Number(o?.n ?? 0)}건`} />
        <Stat label="매출" value={won(Number(o?.revenue ?? 0))} />
      </div>

      {campaign.abLanding ? (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">랜딩 A/B 테스트 진행 중</p>
            <span className="text-xs text-zinc-400">트래픽 50:50</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["a", "b"] as const).map((v) => {
              const s = abStat(v);
              return (
                <div key={v} className="rounded-xl border p-4">
                  <p className="mb-1 text-sm font-bold">
                    변형 {v.toUpperCase()}
                  </p>
                  <p className="text-xs text-zinc-500">
                    신청 {s.n} · 구매 {s.p} · 전환율{" "}
                    <b className="text-zinc-800">{s.rate}%</b>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Link
                      href={`/admin/builder/${id}/landing${v === "b" ? "?variant=b" : ""}`}
                      className="rounded-md bg-black px-3 py-1.5 text-xs text-white"
                    >
                      편집
                    </Link>
                    <form action={endAbTest}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="winner" value={v} />
                      <button className="rounded-md border px-3 py-1.5 text-xs">
                        이 변형 채택
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="mt-6 flex items-center justify-between">
          <p className="text-sm">
            <b>랜딩 A/B 테스트</b>{" "}
            <span className="text-zinc-400">
              — 발행된 랜딩을 복제해 변형 B를 만들고 트래픽을 50:50으로 나눕니다.
            </span>
          </p>
          <form action={startAbTest}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-lg border px-3 py-2 text-sm font-semibold">
              A/B 테스트 시작
            </button>
          </form>
        </Card>
      )}

      {(() => {
        const steps = resolveFlowSteps(campaign);
        const enabled = steps.filter((s) => s.enabled);
        const disabled = ADDABLE_STEPS.filter(
          (pt) => !steps.some((s) => s.pageType === pt && s.enabled),
        );

        const stepRow = (pageType: string, i: number) => {
          const meta = STEP_META[pageType];
          if (!meta) return null;
          const pub = pubMap.get(pageType as never);
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
                    <span className="text-xs text-zinc-400">
                      v{pub.version} 발행
                    </span>
                  ) : (
                    <Tag tone="amber">미발행</Tag>
                  ))}
                {meta.note && (
                  <span className="text-[11px] text-zinc-400">{meta.note}</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <FlowBtn campaignId={id} pageType={pageType} op="up" label="▲" />
                <FlowBtn
                  campaignId={id}
                  pageType={pageType}
                  op="down"
                  label="▼"
                />
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
          <Card className="mt-6">
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

            {disabled.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-xs font-semibold text-zinc-500">
                  추가할 수 있는 단계
                </p>
                <div className="flex flex-wrap gap-2">
                  {disabled.map((pt) => (
                    <form key={pt} action={setFlowStep}>
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="pageType" value={pt} />
                      <input type="hidden" name="op" value="add" />
                      <button className="rounded-lg border border-dashed px-3 py-1.5 text-xs text-zinc-600 hover:border-solid hover:bg-zinc-50">
                        + {STEP_META[pt].title}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}
          </Card>
        );
      })()}
    </>
  );
}

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
