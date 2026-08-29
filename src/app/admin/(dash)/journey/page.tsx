import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationTriggers,
  campaignMessages,
  messageLogs,
} from "@/db/schema";
import { PageHeader } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import { JOURNEY_STOPS, VAR_KEY } from "./meta";
import { JourneyBoard, type ResolvedStop } from "./JourneyBoard";

export const dynamic = "force-dynamic";

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignId } = await searchParams;

  let globals: (typeof automationTriggers.$inferSelect)[] = [];
  let overrides: (typeof campaignMessages.$inferSelect)[] = [];
  let sentByTrigger = new Map<string, number>();
  let connected = true;

  try {
    globals = await db.select().from(automationTriggers);
    if (campaignId) {
      overrides = await db
        .select()
        .from(campaignMessages)
        .where(sql`${campaignMessages.campaignId} = ${campaignId}`);
    }
    const rows = await db
      .select({
        trigger: messageLogs.trigger,
        n: sql<number>`count(*) filter (where ${messageLogs.status} = 'sent')::int`,
      })
      .from(messageLogs)
      .groupBy(messageLogs.trigger);
    sentByTrigger = new Map(rows.map((r) => [r.trigger, Number(r.n)]));
  } catch {
    connected = false;
  }

  const campaignOptions = await listCampaigns();
  const gByKey = new Map<string, (typeof globals)[number]>(
    globals.map((g) => [g.key, g]),
  );
  const ovByKey = new Map<string, (typeof overrides)[number]>(
    overrides.map((o) => [o.trigger, o]),
  );

  const resolved: ResolvedStop[] = JOURNEY_STOPS.map((stop) => {
    const g = gByKey.get(stop.triggerKey);
    const ov = campaignId ? ovByKey.get(stop.triggerKey) : undefined;
    return {
      triggerKey: stop.triggerKey,
      enabled: ov?.enabled ?? g?.enabled ?? true,
      template: ov?.template || g?.template || "",
      offsetHours: ov?.offsetHours ?? g?.offsetHours ?? stop.offsetHours,
      source: ov?.template ? "campaign" : g?.template ? "global" : "default",
      missing: !g,
      sent: sentByTrigger.get(stop.triggerKey) ?? 0,
    };
  });

  return (
    <>
      <PageHeader
        title="고객 여정 지도"
        desc={
          campaignId
            ? "이 캠페인의 문자. 비우면 전역 기본 문구를 사용합니다."
            : "손님이 퍼널 어디쯤 있을 때 어떤 문자가 자동으로 나가는지 한눈에."
        }
        actions={<CampaignFilter options={campaignOptions} />}
      />

      {!connected && (
        <p className="mb-4 text-sm text-amber-600">DB 미연결 — seed 후 사용.</p>
      )}

      <JourneyBoard resolved={resolved} campaignId={campaignId ?? null} />

      <div className="mt-6 rounded-xl border bg-zinc-50 p-4 text-[12.5px] text-zinc-600">
        <b className="text-zinc-900">{"{ }"} 안은 발송할 때 자동으로 채워집니다</b>
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {VAR_KEY.map((v) => (
            <div key={v.name} className="contents">
              <dt className="font-mono font-semibold text-teal-700">{v.name}</dt>
              <dd className="m-0">
                {v.desc}
                {v.pending && (
                  <span className="text-amber-600"> (신규 변수 — 배선 중)</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
