"use server";

import { revalidatePath } from "next/cache";
import { sendLiveNotice, type LiveNoticeKind } from "@/lib/events";
import { normalizePhone } from "@/lib/phone";

export type NoticeResult = { ok?: string; error?: string } | null;

/**
 * 라이브 안내 수동 발송. 실제 문자가 나가는 동작이라
 * 잘못 눌러도 되돌릴 수 있게 dryRun / 테스트 번호를 항상 함께 제공한다.
 */
export async function sendNotice(
  _prev: NoticeResult,
  fd: FormData,
): Promise<NoticeResult> {
  const campaignId = String(fd.get("campaignId") ?? "");
  const eventId = String(fd.get("eventId") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const raw = String(fd.get("kind") ?? "");
  const kind = (
    ["rsvp", "soon", "start", "nudge", "custom"].includes(raw) ? raw : "soon"
  ) as LiveNoticeKind;
  const audRaw = String(fd.get("audience") ?? "");
  const audience = (
    ["all", "unattended", "rsvped"].includes(audRaw) ? audRaw : undefined
  ) as "all" | "unattended" | "rsvped" | undefined;
  const withLink = fd.get("noLink") !== "on";
  const dryRun = fd.get("dryRun") === "on";
  const toTest = String(fd.get("recipients") ?? "all") === "test";
  const rawPhone = String(fd.get("testPhone") ?? "").trim();

  if (!eventId) return { error: "어떤 회차인지 골라주세요." };
  if (!body) return { error: "안내 문구를 입력해주세요." };

  let testPhone: string | null = null;
  if (toTest) {
    const p = normalizePhone(rawPhone);
    if (!/^01\d{8,9}$/.test(p))
      return { error: "테스트로 받을 휴대폰 번호를 정확히 입력해주세요." };
    testPhone = p;
  }

  try {
    const r = await sendLiveNotice({
      eventId,
      kind,
      body,
      liveUrl: String(fd.get("liveUrl") ?? ""),
      memo: String(fd.get("memo") ?? ""),
      testPhone,
      dryRun,
      audience,
      withLink,
    });
    revalidatePath(`/admin/campaigns/${campaignId}/live`);

    if (r.test)
      return {
        ok: dryRun
          ? "검증만 했습니다 — 실제 문자는 나가지 않았어요."
          : "테스트 문자를 보냈습니다.",
      };
    if (dryRun)
      return {
        ok: `검증 완료 — 받을 사람 ${r.total}명. 실제 문자는 나가지 않았어요.`,
      };
    return {
      ok: `${r.sent}명에게 보냈습니다.${
        r.failed ? ` (연락처 없음 등 ${r.failed}명 제외)` : ""
      }`,
    };
  } catch (e) {
    console.error("sendNotice failed", e);
    return { error: "발송에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}
