import Link from "next/link";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { messageAutomations, messageAutomationSteps } from "@/db/schema";
import { Card, PageHeader, Tag, fmtDate } from "@/components/admin-ui";
import {
  getKakaoStatus,
  listKakaoTemplates,
  previewTemplate,
} from "@/lib/kakao";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  APPROVED: { label: "승인됨", tone: "green" },
  INSPECTING: { label: "심사중", tone: "amber" },
  PENDING: { label: "대기", tone: "gray" },
  REJECTED: { label: "반려", tone: "red" },
};

export default async function KakaoSettingsPage() {
  const status = await getKakaoStatus();
  const templates = status.solapiReady ? await listKakaoTemplates() : [];

  // 알림톡으로 연결된 자동 메시지 스텝
  const usedRows = await db
    .select({
      templateId: messageAutomationSteps.kakaoTemplateId,
      autoName: messageAutomations.name,
    })
    .from(messageAutomationSteps)
    .innerJoin(
      messageAutomations,
      eq(messageAutomations.id, messageAutomationSteps.automationId),
    )
    .where(
      and(
        eq(messageAutomationSteps.channel, "alimtalk"),
        isNotNull(messageAutomationSteps.kakaoTemplateId),
      ),
    );
  const usedBy = new Map<string, string[]>();
  for (const r of usedRows) {
    if (!r.templateId) continue;
    usedBy.set(r.templateId, [...(usedBy.get(r.templateId) ?? []), r.autoName]);
  }

  const approved = templates.filter((t) => t.status === "APPROVED").length;

  return (
    <>
      <PageHeader
        title="카카오 알림톡"
        desc="솔라피를 통해 승인된 템플릿을 불러와 자동 메시지에 연결합니다."
        actions={
          <Link
            href="/admin/settings"
            className="text-xs text-blue-600 underline"
          >
            ← 연동 설정
          </Link>
        }
      />

      <div className="space-y-6">
        {/* ── 채널 연결 상태 ── */}
        <Card>
          <p className="flex items-center gap-2 text-sm font-bold">
            발신 채널
            <Tag
              tone={
                status.channelLinked
                  ? "green"
                  : status.channelIdSet
                    ? "amber"
                    : "red"
              }
            >
              {status.channelLinked
                ? "연결됨"
                : status.channelIdSet
                  ? "확인 필요"
                  : "미연결"}
            </Tag>
          </p>

          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Row
              k="솔라피 API"
              v={status.solapiReady ? "설정됨" : "미설정"}
              ok={status.solapiReady}
            />
            <Row
              k="채널 ID (SOLAPI_KAKAO_CHANNEL_ID)"
              v={status.channelId || "미설정"}
              ok={status.channelIdSet}
            />
            <Row
              k="솔라피 채널 연동"
              v={
                status.channelLinked
                  ? (status.channelName ?? "확인됨")
                  : status.channelIdSet
                    ? "확인 안 됨"
                    : "채널 ID 먼저"
              }
              ok={status.channelLinked}
            />
          </dl>

          {status.error && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              솔라피 응답: {status.error}
            </p>
          )}

          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-[12.5px] leading-relaxed text-zinc-600">
            <b>연결 순서</b>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                카카오 비즈니스에서{" "}
                <b>런치스케일 채널</b>을 만들고 검색용 아이디를 확보
              </li>
              <li>
                솔라피 콘솔 → <b>카카오 채널</b> → 채널 연동 (토큰 인증)
              </li>
              <li>
                연동되면 뜨는 <b>채널 ID(pfId, <code>KA01PF…</code>)</b>를 Vercel
                환경변수 <code>SOLAPI_KAKAO_CHANNEL_ID</code>에 넣고 재배포
              </li>
              <li>이 화면에서 &ldquo;연결됨&rdquo;으로 바뀌면 완료</li>
            </ol>
          </div>
        </Card>

        {/* ── 템플릿 목록 ── */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              알림톡 템플릿{" "}
              <span className="font-normal text-zinc-400">
                {templates.length}개 · 승인 {approved}
              </span>
            </p>
            {templates[0] && (
              <span className="text-[11px] text-zinc-400">
                마지막 동기화 {fmtDate(templates[0].syncedAt)}
              </span>
            )}
          </div>

          <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
            템플릿 문구·변수·버튼은 <b>카카오 심사 대상</b>이라 여기서 수정할 수
            없습니다. 솔라피 콘솔에서 등록·수정하고, 이 버튼으로 최신 상태를
            당겨옵니다.
          </p>

          <SyncButton disabled={!status.channelLinked} />

          {templates.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-zinc-400">
              불러온 템플릿이 없습니다.
              {!status.channelLinked &&
                " 채널을 먼저 연결하세요."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {templates.map((t) => {
                const meta = STATUS_LABEL[t.status] ?? {
                  label: t.status,
                  tone: "gray" as const,
                };
                const linked = usedBy.get(t.id) ?? [];
                return (
                  <li
                    key={t.id}
                    className="rounded-xl border border-zinc-200 p-3.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900">
                        {t.name}
                      </span>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      {linked.length > 0 ? (
                        <Tag tone="blue">연결: {linked.join(", ")}</Tag>
                      ) : t.status === "APPROVED" ? (
                        <Tag tone="amber">아직 자동 메시지에 연결 안 됨</Tag>
                      ) : null}
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2.5 text-[12px] leading-relaxed text-zinc-600">
                      {previewTemplate(t.content, t.header)}
                    </pre>
                    {t.variables.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                        <span className="text-zinc-400">변수</span>
                        {t.variables.map((v) => (
                          <code
                            key={v}
                            className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600"
                          >
                            {"#{"}
                            {v}
                            {"}"}
                          </code>
                        ))}
                      </p>
                    )}
                    <p className="mt-1 text-[10.5px] text-zinc-400">
                      ID {t.solapiTemplateId}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── 자동 메시지 연결 안내 ── */}
        <Card>
          <p className="text-sm font-bold">자동 메시지에 연결하기</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
            승인된 템플릿을 자동 메시지의 각 문자에 붙입니다. 문자 편집 화면에서
            <b> 발송 채널 → 알림톡</b>을 고르고 템플릿을 선택하면, 그 시점부터
            알림톡으로 나갑니다. (실패하면 기존 문자 문구로 자동 대체)
          </p>
          <Link
            href="/admin/automation"
            className="mt-3 inline-block text-xs text-blue-600 underline"
          >
            자동 메시지로 가기 →
          </Link>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="min-w-0 text-zinc-600">{k}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="font-mono text-[12px] text-zinc-800">{v}</span>
        <span className={ok ? "text-emerald-500" : "text-zinc-300"}>
          {ok ? "●" : "○"}
        </span>
      </span>
    </div>
  );
}
