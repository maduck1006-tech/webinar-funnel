import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationTriggers,
  campaignMessages,
  messageLogs,
  type AutomationTrigger,
} from "@/db/schema";
import { Card, PageHeader, Tag } from "@/components/admin-ui";
import { CampaignFilter } from "@/components/CampaignFilter";
import { listCampaigns } from "@/lib/campaign";
import {
  resetCampaignMessage,
  saveCampaignMessage,
  saveTemplate,
  toggleCampaignMessage,
  toggleTrigger,
} from "./actions";

export const dynamic = "force-dynamic";

const TRIGGERS = [
  { key: "signup_confirm", label: "신청 즉시", condition: "신청 완료", offsetHours: 0 },
  { key: "reminder_24h", label: "DB 입력 +24h", condition: "시청 기한 내 · 미구매", offsetHours: 24 },
  { key: "reminder_12h_left", label: "DB 입력 +36h", condition: "시청 기한 내 · 미구매", offsetHours: 36 },
  { key: "reminder_1h_left", label: "DB 입력 +47h", condition: "시청 기한 내 · 미구매", offsetHours: 47 },
  { key: "pre_payment_nudge", label: "결제 직전 유도", condition: "저가 상품 미결제", offsetHours: 3 },
  { key: "payment_success", label: "결제 완료 즉시", condition: "토스페이먼츠 결제 DONE", offsetHours: null },
] as const;

const VARS_HINT =
  "변수: {이름} {링크} {예약링크} {결제링크} {상품명} {마감시각} · 비우면 기본 문구 사용";

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignId } = await searchParams;

  let globals: AutomationTrigger[] = [];
  let overrides: (typeof campaignMessages.$inferSelect)[] = [];
  let logStats: { status: string; n: number }[] = [];
  let connected = true;
  try {
    globals = await db.select().from(automationTriggers);
    if (campaignId)
      overrides = await db
        .select()
        .from(campaignMessages)
        .where(eq(campaignMessages.campaignId, campaignId));
    logStats = await db
      .select({ status: messageLogs.status, n: sql<number>`count(*)` })
      .from(messageLogs)
      .groupBy(messageLogs.status);
  } catch {
    connected = false;
  }

  const campaignOptions = await listCampaigns();
  const globalByKey = new Map(globals.map((g) => [g.key, g]));
  const overrideByKey = new Map(overrides.map((o) => [o.trigger, o]));

  const sent = Number(logStats.find((s) => s.status === "sent")?.n ?? 0);
  const failed = Number(logStats.find((s) => s.status === "failed")?.n ?? 0);

  return (
    <>
      <PageHeader
        title="자동화 · CRM 메시지"
        desc={
          campaignId
            ? "이 캠페인의 문자 문구. 비워두면 전역 기본값을 사용합니다."
            : "전역 기본 트리거 On/Off · 문구. 캠페인을 고르면 캠페인별로 덮어쓸 수 있습니다."
        }
        actions={<CampaignFilter options={campaignOptions} />}
      />

      {!connected && (
        <p className="mb-4 text-sm text-amber-600">DB 미연결 — seed 후 사용.</p>
      )}

      <Card className="mb-6">
        <p className="text-sm">
          발송 로그 · 성공 <b>{sent}</b> · 실패 <b>{failed}</b>
        </p>
      </Card>

      <div className="space-y-3">
        {TRIGGERS.map((t) => {
          const g = globalByKey.get(t.key);
          const ov = campaignId ? overrideByKey.get(t.key) : undefined;
          const gId = g?.id ?? t.key;

          // 전역 카드
          if (!campaignId) {
            return (
              <TriggerCard
                key={t.key}
                title={t.label}
                sub={`조건: ${t.condition}${
                  t.offsetHours != null ? ` · +${t.offsetHours}h` : ""
                }`}
                badge={null}
                enabled={g?.enabled ?? true}
                offsetHours={g?.offsetHours ?? t.offsetHours}
                showOffset={t.offsetHours != null}
                toggleForm={
                  <form action={toggleTrigger}>
                    <input type="hidden" name="id" value={gId} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={String(!(g?.enabled ?? true))}
                    />
                    <button>
                      <Tag tone={g?.enabled ?? true ? "green" : "gray"}>
                        {g?.enabled ?? true ? "ON" : "OFF"}
                      </Tag>
                    </button>
                  </form>
                }
                saveForm={
                  <form action={saveTemplate} className="mt-2">
                    <input type="hidden" name="id" value={gId} />
                    <textarea
                      name="template"
                      defaultValue={g?.template ?? ""}
                      placeholder={VARS_HINT}
                      className="h-20 w-full rounded border px-2 py-1 text-sm"
                    />
                    <button className="mt-1 rounded-lg border px-3 py-1 text-xs">
                      전역 문구 저장
                    </button>
                  </form>
                }
              />
            );
          }

          // 캠페인 카드 (오버라이드 있음 / 없음)
          const effEnabled = ov?.enabled ?? g?.enabled ?? true;
          const effTemplate = ov?.template ?? "";
          const effOffset = ov?.offsetHours ?? g?.offsetHours ?? t.offsetHours;
          return (
            <TriggerCard
              key={t.key}
              title={t.label}
              sub={`조건: ${t.condition}`}
              badge={
                ov ? (
                  <Tag tone="blue">이 캠페인 전용</Tag>
                ) : (
                  <Tag tone="gray">전역 기본값</Tag>
                )
              }
              enabled={effEnabled}
              offsetHours={effOffset}
              showOffset={t.offsetHours != null}
              toggleForm={
                <form action={toggleCampaignMessage}>
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="trigger" value={t.key} />
                  <input type="hidden" name="template" value={effTemplate} />
                  <input
                    type="hidden"
                    name="offsetHours"
                    value={effOffset ?? ""}
                  />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!effEnabled)}
                  />
                  <button>
                    <Tag tone={effEnabled ? "green" : "gray"}>
                      {effEnabled ? "ON" : "OFF"}
                    </Tag>
                  </button>
                </form>
              }
              saveForm={
                <form action={saveCampaignMessage} className="mt-2 space-y-1.5">
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="trigger" value={t.key} />
                  <input type="hidden" name="enabled" value={String(effEnabled)} />
                  <textarea
                    name="template"
                    defaultValue={effTemplate}
                    placeholder={
                      g?.template
                        ? `전역: ${g.template.slice(0, 40)}…`
                        : VARS_HINT
                    }
                    className="h-20 w-full rounded border px-2 py-1 text-sm"
                  />
                  {t.offsetHours != null && (
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      발송 시점(시간)
                      <input
                        name="offsetHours"
                        defaultValue={effOffset ?? ""}
                        className="w-16 rounded border px-1 py-0.5"
                      />
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button className="rounded-lg bg-black px-3 py-1 text-xs font-semibold text-white">
                      이 캠페인 문구 저장
                    </button>
                    {ov && (
                      <button
                        formAction={resetCampaignMessage}
                        className="rounded-lg border px-3 py-1 text-xs text-zinc-500"
                      >
                        전역 기본값으로
                      </button>
                    )}
                  </div>
                </form>
              }
            />
          );
        })}
      </div>
    </>
  );
}

function TriggerCard({
  title,
  sub,
  badge,
  enabled,
  showOffset,
  offsetHours,
  toggleForm,
  saveForm,
}: {
  title: string;
  sub: string;
  badge: React.ReactNode;
  enabled: boolean;
  showOffset: boolean;
  offsetHours: number | null;
  toggleForm: React.ReactNode;
  saveForm: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            {title} {badge}
          </p>
          <p className="text-xs text-zinc-500">
            {sub}
            {showOffset && offsetHours != null && ` · +${offsetHours}h`}
            {!enabled && " · (꺼짐)"}
          </p>
        </div>
        {toggleForm}
      </div>
      {saveForm}
    </Card>
  );
}
