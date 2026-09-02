import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignProducts, campaigns, events, products } from "@/db/schema";
import { Card, PageHeader, Tag } from "@/components/admin-ui";
import { CampaignTabs } from "../CampaignTabs";
import { ConfirmSubmit, SubmitButton } from "../../../form-ui";
import { resolveFlowSteps, STEP_META } from "@/lib/funnel-flow";
import {
  deleteEvent,
  saveEvent,
  setCampaignProduct,
  updateCampaign,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function CampaignSettings({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!c) notFound();

  const allProducts = await db
    .select()
    .from(products)
    .orderBy(asc(products.createdAt));
  const mapped = await db
    .select()
    .from(campaignProducts)
    .where(eq(campaignProducts.campaignId, id));
  const mappedMap = new Map(mapped.map((m) => [m.productId, m.placement]));
  const mappedFull = new Map(mapped.map((m) => [m.productId, m]));
  const nameOf = new Map(allProducts.map((p) => [p.id, p.name]));
  const productName = (pid: string | null) =>
    pid ? (nameOf.get(pid) ?? "삭제된 상품") : null;

  // 이 캠페인의 퍼널에 실제 존재하는 단계 → 상품을 놓을 수 있는 위치만 노출
  const enabledSteps = new Set(
    resolveFlowSteps(c)
      .filter((s) => s.enabled)
      .map((s) => s.pageType),
  );
  const placementOpts: { value: string; label: string }[] = [];
  if (enabledSteps.has("thankyou") && enabledSteps.has("vod"))
    placementOpts.push({ value: "both", label: "땡큐 + VOD 두 곳 (권장)" });
  if (enabledSteps.has("thankyou"))
    placementOpts.push({ value: "thankyou", label: "땡큐 페이지" });
  if (enabledSteps.has("vod"))
    placementOpts.push({ value: "vod_bottom", label: "VOD 시청 페이지 하단" });
  if (enabledSteps.has("sales"))
    placementOpts.push({ value: "sales", label: "세일즈 페이지 (메인 상품)" });
  if (placementOpts.length === 0)
    placementOpts.push({ value: "both", label: "기본" });
  const flowTitles = resolveFlowSteps(c)
    .filter((s) => s.enabled)
    .map((s) => STEP_META[s.pageType]?.title ?? s.pageType)
    .join(" → ");

  const campaignEvents = await db
    .select()
    .from(events)
    .where(eq(events.campaignId, id))
    .orderBy(asc(events.startsAt));

  const iso = (d: Date | null) =>
    d ? d.toISOString().slice(0, 16) : undefined;

  return (
    <>
      <PageHeader
        title={`${c.name} · 설정`}
        desc={
          <Link
            href={`/admin/campaigns/${id}`}
            className="text-blue-600 underline"
          >
            ← 캠페인
          </Link>
        }
      />

      <CampaignTabs id={id} slug={c.slug} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-sm font-bold">기본 / 콘텐츠</p>
          <form action={updateCampaign} className="space-y-2.5 text-sm">
            <input type="hidden" name="id" value={id} />
            <F label="이름" name="name" defaultValue={c.name} />
            <F
              label="URL slug (변경 시 이전 주소는 자동 리다이렉트)"
              name="slug"
              defaultValue={c.slug}
              mono
            />
            <label className="block">
              <span className="text-xs text-zinc-500">퍼널 종류</span>
              <select
                name="funnelType"
                defaultValue={c.funnelType}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="evergreen_webinar">에버그린 무료강의</option>
                <option value="live_webinar_reg">라이브 웨비나 신청</option>
                <option value="vod_course">VOD 강의 판매</option>
                <option value="ebook">전자책 판매</option>
                <option value="paid_consult">유료 상담</option>
              </select>
            </label>
            <F
              label="VOD 영상 링크 (YouTube · Vimeo · MP4)"
              name="vodSrc"
              defaultValue={c.vodSrc ?? ""}
            />
            <F
              label="시청 기한 (시간)"
              name="vodWindowHours"
              defaultValue={String(c.vodWindowHours)}
            />
            <p className="pt-2 text-xs font-semibold text-zinc-500">
              종착 단계 (VOD 시청 후)
            </p>
            <label className="block">
              <span className="text-xs text-zinc-500">종착</span>
              <select
                name="terminalStep"
                defaultValue={c.terminalStep}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="booking">1:1 상담 예약 (되는시간)</option>
                <option value="groupchat">무료 단톡방 입장</option>
                <option value="sales">유료 세일즈 페이지</option>
              </select>
            </label>
            <F
              label="되는시간 임베드 URL (종착=예약)"
              name="bookingEmbedUrl"
              defaultValue={c.bookingEmbedUrl ?? ""}
            />
            <F
              label="단톡방 초대 링크 (종착=단톡방 · 문자 {단톡방링크} 변수)"
              name="groupChatUrl"
              defaultValue={c.groupChatUrl ?? ""}
            />
            <F
              label="워크북 다운로드 URL (문자 {다운로드링크} 변수 · 비우면 시청 링크)"
              name="downloadUrl"
              defaultValue={c.downloadUrl ?? ""}
            />
            <F
              label="결제 후 이동 URL (비우면 /slug/vod?paid=1 · 전환 픽셀 자동)"
              name="checkoutRedirectUrl"
              defaultValue={c.checkoutRedirectUrl ?? ""}
            />

            <p className="pt-2 text-xs font-semibold text-zinc-500">카운트다운</p>
            <label className="block">
              <span className="text-xs text-zinc-500">모드</span>
              <select
                name="countdownMode"
                defaultValue={c.countdownMode}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="none">없음</option>
                <option value="fixed">고정 마감일</option>
                <option value="evergreen">에버그린(진입 후 N초)</option>
              </select>
            </label>
            <F
              label="고정 마감일 (fixed)"
              name="countdownDeadline"
              type="datetime-local"
              defaultValue={iso(c.countdownDeadline)}
            />
            <F
              label="에버그린 지속(초) (evergreen)"
              name="countdownRushSeconds"
              defaultValue={
                c.countdownRushSeconds ? String(c.countdownRushSeconds) : ""
              }
            />

            <p className="pt-2 text-xs font-semibold text-zinc-500">추적</p>
            <F
              label="Meta 픽셀 ID"
              name="metaPixelId"
              defaultValue={c.metaPixelId ?? ""}
            />
            <F
              label="GA4 측정 ID (G-XXXX)"
              name="ga4MeasurementId"
              defaultValue={c.ga4MeasurementId ?? ""}
            />
            <F
              label="기본 utm_campaign"
              name="defaultUtmCampaign"
              defaultValue={c.defaultUtmCampaign ?? c.slug}
            />
            <F
              label="Meta 광고 계정 ID (숫자만 · 비우면 전역 기본값)"
              name="metaAdAccountId"
              defaultValue={c.metaAdAccountId ?? ""}
              mono
            />
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-500">
                Meta 광고 캠페인 ID (쉼표/줄바꿈 구분 · 비우면 계정 전체
                광고비를 기본 캠페인에 귀속)
              </span>
              <textarea
                name="metaAdCampaignIds"
                rows={2}
                defaultValue={(c.metaAdCampaignIds ?? []).join(", ")}
                className="w-full rounded-md border px-2 py-1 font-mono text-xs"
              />
            </label>

            <SubmitButton className="mt-2 w-full rounded-lg bg-black py-2 font-semibold text-white">
              저장
            </SubmitButton>
          </form>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-bold">연결 상품</p>
          <p className="mb-2 text-xs text-zinc-400">
            체크하면 이 캠페인의 CTA 버튼(<code>{"{{checkout}}"}</code>)과 가격
            블록에 연결됩니다. 위치는 이 퍼널의 단계 중에서 고릅니다.
          </p>
          <p className="mb-3 rounded bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-500">
            이 퍼널: {flowTitles}
          </p>
          <ul className="divide-y text-sm">
            {allProducts.length === 0 && (
              <li className="py-3 text-zinc-400">
                등록된 상품 없음 —{" "}
                <Link href="/admin/products" className="text-blue-600 underline">
                  상품 관리
                </Link>
              </li>
            )}
            {allProducts.map((p) => {
              const on = mappedMap.has(p.id);
              const cp = mappedFull.get(p.id);
              return (
                <li key={p.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <form
                      action={setCampaignProduct}
                      className="flex flex-1 items-center gap-2"
                    >
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input
                        type="hidden"
                        name="remove"
                        value={on ? "true" : "false"}
                      />
                      <button
                        className={`h-5 w-5 rounded border ${on ? "bg-black" : "bg-white"}`}
                        aria-label="toggle"
                      >
                        {on && <span className="text-xs text-white">✓</span>}
                      </button>
                      <span className="flex-1">{p.name}</span>
                      {!p.active && <Tag tone="gray">중지</Tag>}
                    </form>
                    {on && (
                      <form
                        action={setCampaignProduct}
                        className="flex items-center gap-1"
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="remove" value="false" />
                        <select
                          name="placement"
                          defaultValue={mappedMap.get(p.id)}
                          className="rounded border px-1 py-0.5 text-xs"
                        >
                          {placementOpts.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button className="rounded border px-2 text-xs">
                          적용
                        </button>
                      </form>
                    )}
                  </div>

                  {on && (
                    <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/admin/campaigns/${id}/offers/${p.id}`}
                        className="rounded border border-blue-500 px-2 py-0.5 text-[11px] font-semibold text-blue-600"
                      >
                        {offerParts(cp, productName).length > 0
                          ? "추가 매출 수정"
                          : "+ 추가 매출 붙이기"}
                      </Link>
                      <span className="text-[11px] text-zinc-500">
                        {offerParts(cp, productName).length > 0
                          ? offerParts(cp, productName).join(" · ")
                          : "오더범프 · 업셀 · 다운셀 (선택)"}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {c.funnelType === "live_webinar_reg" && (
        <Card className="mt-6">
          <p className="mb-1 text-sm font-bold">라이브 웨비나 회차</p>
          <p className="mb-3 text-xs text-zinc-500">
            방송은 유튜브 라이브 등 외부에서 진행합니다. 가장 임박한{" "}
            <b>예정</b> 회차 하나에 새 신청자가 자동 등록되고, 종료(시작+진행시간) 뒤
            replayWindowHours 동안 리플레이가 공개됩니다.
          </p>

          <ul className="mb-4 divide-y divide-zinc-100 text-sm">
            {campaignEvents.length === 0 && (
              <li className="py-3 text-zinc-400">등록된 회차 없음</li>
            )}
            {campaignEvents.map((e) => (
              <li key={e.id} className="py-3">
                <form
                  action={saveEvent}
                  className="grid gap-2 sm:grid-cols-[1fr_90px_1fr_90px_100px_auto]"
                >
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="campaignId" value={id} />
                  <label className="block">
                    <span className="text-[10px] text-zinc-400">시작</span>
                    <input
                      type="datetime-local"
                      name="startsAt"
                      defaultValue={iso(e.startsAt)}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400">진행(분)</span>
                    <input
                      name="durationMin"
                      defaultValue={e.durationMin}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400">
                      외부 라이브 URL
                    </span>
                    <input
                      name="externalLiveUrl"
                      defaultValue={e.externalLiveUrl ?? ""}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400">
                      리플레이 기한(h)
                    </span>
                    <input
                      name="replayWindowHours"
                      defaultValue={e.replayWindowHours}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400">상태</span>
                    <select
                      name="status"
                      defaultValue={e.status}
                      className="mt-0.5 w-full rounded border px-1.5 py-1 text-xs"
                    >
                      <option value="scheduled">예정</option>
                      <option value="ended">종료</option>
                      <option value="canceled">취소</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-1">
                    <button className="rounded border px-2 py-1 text-xs font-semibold text-blue-600">
                      저장
                    </button>
                  </div>
                </form>
                <form action={deleteEvent} className="mt-1 text-right">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="campaignId" value={id} />
                  <ConfirmSubmit
                    message="이 회차를 삭제할까요? 되돌릴 수 없습니다."
                    className="text-[11px] text-red-500 hover:underline"
                  >
                    삭제
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>

          <form
            action={saveEvent}
            className="grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-[1fr_90px_1fr_90px_auto]"
          >
            <input type="hidden" name="campaignId" value={id} />
            <label className="block">
              <span className="text-[10px] text-zinc-400">시작 일시 *</span>
              <input
                type="datetime-local"
                name="startsAt"
                required
                className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-zinc-400">진행(분)</span>
              <input
                name="durationMin"
                defaultValue={60}
                className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-zinc-400">외부 라이브 URL</span>
              <input
                name="externalLiveUrl"
                placeholder="유튜브 라이브 링크"
                className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-zinc-400">리플레이 기한(h)</span>
              <input
                name="replayWindowHours"
                defaultValue={48}
                className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
              />
            </label>
            <button className="self-end rounded-lg border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600">
              + 회차 추가
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

/** 이 매핑에 붙은 추가 오퍼를 사람 말로 한 줄씩 */
function offerParts(
  cp:
    | {
        bumpProductId: string | null;
        upsellProductId: string | null;
        downsellProductId: string | null;
      }
    | undefined,
  nameOf: (id: string | null) => string | null,
): string[] {
  if (!cp) return [];
  return [
    cp.bumpProductId && `범프 ${nameOf(cp.bumpProductId)}`,
    cp.upsellProductId && `업셀 ${nameOf(cp.upsellProductId)}`,
    cp.downsellProductId && `다운셀 ${nameOf(cp.downsellProductId)}`,
  ].filter((x): x is string => Boolean(x));
}

function F({
  label,
  name,
  defaultValue,
  type = "text",
  mono = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className={`mt-1 w-full rounded border px-2 py-1 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}
