import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignPages, campaigns, leads, orders } from "@/db/schema";
import { Card, PageHeader, Stat, Tag, won } from "@/components/admin-ui";
import { PAGE_META, FUNNEL_PAGE_TYPES } from "@/lib/flow-types";
import { campaignBasePath } from "@/lib/campaign";
import { endAbTest, setCampaignStatus, startAbTest } from "../actions";

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

      <Card className="mt-6">
        <p className="mb-3 text-sm font-bold">퍼널 페이지</p>
        <ul className="divide-y">
          {FUNNEL_PAGE_TYPES.map((pt) => {
            const pub = pubMap.get(pt);
            const meta = PAGE_META[pt];
            return (
              <li
                key={pt}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span>
                  {meta.step} · {meta.title}
                  {pub ? (
                    <span className="ml-2 text-xs text-zinc-400">
                      v{pub.version} 발행됨
                    </span>
                  ) : (
                    <Tag tone="amber">미발행</Tag>
                  )}
                </span>
                <span className="flex gap-2">
                  <Link
                    href={`/admin/builder/${id}/${pt}`}
                    className="rounded-md bg-black px-3 py-1.5 text-xs text-white"
                  >
                    편집
                  </Link>
                  <a
                    href={`${basePath}${meta.path}?preview=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border px-3 py-1.5 text-xs"
                  >
                    미리보기
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
