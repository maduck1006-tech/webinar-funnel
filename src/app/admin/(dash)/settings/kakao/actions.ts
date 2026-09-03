"use server";

import { revalidatePath } from "next/cache";
import { syncKakaoTemplates } from "@/lib/kakao";

export type SyncState = { ok?: string; error?: string } | null;

/** useActionState 용 — 이전상태·FormData 는 안 쓴다. */
export async function runSync(): Promise<SyncState> {
  const r = await syncKakaoTemplates();
  revalidatePath("/admin/settings/kakao");
  if (!r.ok) return { error: r.error ?? "동기화에 실패했습니다." };
  return { ok: `템플릿 ${r.saved}개를 불러왔습니다. (조회 ${r.fetched})` };
}
