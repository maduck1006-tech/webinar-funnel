import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kakaoTemplates } from "@/db/schema";
import { kakaoChannelId, solapiConfigured, solapiService } from "@/lib/solapi";

/* ------------------------------------------------------------------ *
 * 카카오 알림톡 — 채널 상태 · 템플릿 동기화
 *
 * 실제 발송은 solapi.ts sendMessage({ kakao }) 가 담당한다.
 * 이 파일은 관리자 화면(/admin/settings/kakao)이 쓰는 조회/동기화 전용.
 * ------------------------------------------------------------------ */

export type KakaoStatus = {
  /** SOLAPI_API_KEY/SECRET 이 있나 */
  solapiReady: boolean;
  /** SOLAPI_KAKAO_CHANNEL_ID 가 설정됐나 */
  channelIdSet: boolean;
  channelId: string;
  /** 솔라피에서 이 채널이 확인되나 (연동 완료) */
  channelLinked: boolean;
  channelName: string | null;
  error: string | null;
};

/** 솔라피에 물어 채널 연동 상태를 확인 */
export async function getKakaoStatus(): Promise<KakaoStatus> {
  const base: KakaoStatus = {
    solapiReady: solapiConfigured,
    channelIdSet: Boolean(kakaoChannelId),
    channelId: kakaoChannelId,
    channelLinked: false,
    channelName: null,
    error: null,
  };
  if (!solapiConfigured || !kakaoChannelId) return base;

  try {
    const ch = await solapiService().getKakaoChannel(kakaoChannelId);
    return {
      ...base,
      channelLinked: true,
      channelName:
        (ch as { searchId?: string; name?: string }).searchId ??
        (ch as { name?: string }).name ??
        kakaoChannelId,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

export type SyncResult = {
  ok: boolean;
  fetched: number;
  saved: number;
  error?: string;
};

/**
 * 솔라피의 승인된(+심사중) 템플릿을 kakao_templates 에 upsert.
 * 채널 ID 로 필터한다.
 */
export async function syncKakaoTemplates(): Promise<SyncResult> {
  if (!solapiConfigured)
    return { ok: false, fetched: 0, saved: 0, error: "솔라피 키가 없습니다" };
  if (!kakaoChannelId)
    return {
      ok: false,
      fetched: 0,
      saved: 0,
      error: "SOLAPI_KAKAO_CHANNEL_ID 가 설정되지 않았습니다",
    };

  try {
    let saved = 0;
    let fetched = 0;
    let nextKey: string | null | undefined;

    do {
      const res = await solapiService().getKakaoAlimtalkTemplates({
        channelId: kakaoChannelId,
        limit: 50,
        ...(nextKey ? { startKey: nextKey } : {}),
      });
      const list = res.templateList ?? [];
      fetched += list.length;

      for (const t of list) {
        const tpl = t as {
          templateId: string;
          name: string;
          content: string;
          header?: string | null;
          status: string;
          variables?: { name: string }[];
          buttons?: Record<string, unknown>[];
        };
        await db
          .insert(kakaoTemplates)
          .values({
            solapiTemplateId: tpl.templateId,
            channelId: kakaoChannelId,
            name: tpl.name,
            content: tpl.content,
            header: tpl.header ?? null,
            status: tpl.status,
            variables: (tpl.variables ?? []).map((v) => v.name),
            buttons: tpl.buttons ?? [],
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: kakaoTemplates.solapiTemplateId,
            set: {
              name: tpl.name,
              content: tpl.content,
              header: tpl.header ?? null,
              status: tpl.status,
              variables: (tpl.variables ?? []).map((v) => v.name),
              buttons: tpl.buttons ?? [],
              syncedAt: new Date(),
            },
          });
        saved++;
      }
      nextKey = res.nextKey;
    } while (nextKey);

    return { ok: true, fetched, saved };
  } catch (e) {
    return {
      ok: false,
      fetched: 0,
      saved: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listKakaoTemplates() {
  return db
    .select()
    .from(kakaoTemplates)
    .orderBy(desc(kakaoTemplates.status), kakaoTemplates.name);
}

export async function getKakaoTemplate(id: string) {
  const [t] = await db
    .select()
    .from(kakaoTemplates)
    .where(eq(kakaoTemplates.id, id));
  return t ?? null;
}

/** 템플릿 본문 미리보기 — #{변수} 를 샘플 값으로 치환 */
export function previewTemplate(
  content: string,
  header: string | null,
  sample: Record<string, string> = {},
): string {
  const body = content.replace(/#\{([^}]+)\}/g, (_, k: string) => sample[k] ?? `#{${k}}`);
  return header ? `[${header}]\n${body}` : body;
}
