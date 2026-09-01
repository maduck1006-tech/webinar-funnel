import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  messageAutomations,
  messageAutomationSteps,
  messageSends,
} from "@/db/schema";
import { PageHeader } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import { JOURNEY_STOPS, VAR_KEY } from "./meta";
import { JourneyBoard, type ResolvedStop } from "./JourneyBoard";

export const dynamic = "force-dynamic";

/** 여정 지도의 stop triggerKey → 새 자동 메시지 (key, stepOrder) */
const STOP_MAP: Record<string, { key: string; step: number }> = {
  signup_confirm: { key: "signup_confirm", step: 1 },
  pre_payment_nudge: { key: "payment_nudge", step: 1 },
  reminder_24h: { key: "watch_deadline", step: 1 },
  reminder_12h_left: { key: "watch_deadline", step: 2 },
  reminder_1h_left: { key: "watch_deadline", step: 3 },
  payment_success: { key: "payment_done", step: 1 },
};

export default async function JourneyPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignId } = await searchParams;

  let connected = true;
  type AutoWithSteps = {
    auto: typeof messageAutomations.$inferSelect;
    steps: (typeof messageAutomationSteps.$inferSelect)[];
  };
  let autos: AutoWithSteps[] = [];
  let sentByStep = new Map<string, number>();

  try {
    const rows = await db
      .select()
      .from(messageAutomations)
      .where(
        campaignId
          ? or(
              eq(messageAutomations.campaignId, campaignId),
              isNull(messageAutomations.campaignId),
            )
          : isNull(messageAutomations.campaignId),
      );
    autos = await Promise.all(
      rows.map(async (auto) => ({
        auto,
        steps: await db
          .select()
          .from(messageAutomationSteps)
          .where(eq(messageAutomationSteps.automationId, auto.id))
          .orderBy(asc(messageAutomationSteps.stepOrder)),
      })),
    );
    const s = await db
      .select({
        stepId: messageSends.stepId,
        n: sql<number>`count(*) filter (where ${messageSends.status} = 'sent')::int`,
      })
      .from(messageSends)
      .groupBy(messageSends.stepId);
    sentByStep = new Map(s.map((r) => [r.stepId, Number(r.n)]));
  } catch {
    connected = false;
  }

  const campaignOptions = await listCampaigns();

  // key 별로 캠페인 전용본 우선
  const byKey = new Map<string, AutoWithSteps>();
  for (const x of autos) {
    if (!x.auto.key) continue;
    const cur = byKey.get(x.auto.key);
    if (!cur || (x.auto.campaignId && !cur.auto.campaignId))
      byKey.set(x.auto.key, x);
  }

  const resolved: ResolvedStop[] = JOURNEY_STOPS.map((stop) => {
    const m = STOP_MAP[stop.triggerKey];
    const found = m ? byKey.get(m.key) : undefined;
    const step = found?.steps.find((s) => s.stepOrder === (m?.step ?? 1));
    return {
      triggerKey: stop.triggerKey,
      enabled: (found?.auto.enabled ?? true) && (step?.enabled ?? true),
      template: step?.body ?? "",
      offsetHours: step ? step.delayMinutes / 60 : stop.offsetHours,
      source: found?.auto.campaignId ? "campaign" : found ? "global" : "default",
      missing: !step,
      sent: step ? (sentByStep.get(step.id) ?? 0) : 0,
      automationId: found?.auto.id ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="고객 여정 지도"
        desc="손님이 퍼널 어디쯤 있을 때 어떤 문자가 자동으로 나가는지 한눈에. 편집은 '자동 메시지'에서."
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
              <dd className="m-0">{v.desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
