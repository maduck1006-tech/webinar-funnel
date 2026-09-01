import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leads, phoneOtps, userSessions, users, type User } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/solapi";

const SESSION_COOKIE = "usr";
const SESSION_DAYS = 60;
const OTP_TTL_MIN = 5;
const OTP_RESEND_SEC = 60;
const OTP_MAX_ATTEMPTS = 5;

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** 인증번호 발송. 성공/쿨다운 여부 반환 */
export async function requestOtp(
  rawPhone: string,
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!/^01[0-9]{8,9}$/.test(phone)) {
    return { ok: false, error: "휴대폰 번호를 확인해 주세요." };
  }

  const [recent] = await db
    .select({ createdAt: phoneOtps.createdAt })
    .from(phoneOtps)
    .where(eq(phoneOtps.phone, phone))
    .orderBy(desc(phoneOtps.createdAt))
    .limit(1);
  if (
    recent &&
    Date.now() - recent.createdAt.getTime() < OTP_RESEND_SEC * 1000
  ) {
    return { ok: false, error: "잠시 후 다시 시도해 주세요." };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
  await db.insert(phoneOtps).values({
    phone,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
  });

  await sendSms(
    phone,
    `[인증번호] ${code}\n${OTP_TTL_MIN}분 안에 입력해 주세요.`,
    { immediate: true },
  );
  return { ok: true };
}

/** 인증번호 검증 → 성공 시 유저 upsert + 세션 쿠키 설정 + leads 연결 */
export async function verifyOtp(
  rawPhone: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(rawPhone);
  const [otp] = await db
    .select()
    .from(phoneOtps)
    .where(eq(phoneOtps.phone, phone))
    .orderBy(desc(phoneOtps.createdAt))
    .limit(1);

  if (!otp) return { ok: false, error: "인증번호를 다시 요청해 주세요." };
  if (otp.expiresAt.getTime() < Date.now()) {
    await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
    return { ok: false, error: "인증번호가 만료됐어요. 다시 요청해 주세요." };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
    return { ok: false, error: "시도 횟수를 초과했어요. 다시 요청해 주세요." };
  }
  if (sha256(code.trim()) !== otp.codeHash) {
    await db
      .update(phoneOtps)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(phoneOtps.id, otp.id));
    return { ok: false, error: "인증번호가 일치하지 않아요." };
  }

  await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));

  // 유저 upsert (phone unique)
  let [user] = await db.select().from(users).where(eq(users.phone, phone));
  if (!user) {
    const [name] = await db
      .select({ name: leads.name })
      .from(leads)
      .where(eq(leads.phone, phone))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    [user] = await db
      .insert(users)
      .values({ phone, name: name?.name ?? null, lastLoginAt: new Date() })
      .returning();
  } else {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
  }

  // 이 번호의 기존 leads 를 계정에 연결
  await db
    .update(leads)
    .set({ userId: user.id })
    .where(and(eq(leads.phone, phone), isNull(leads.userId)));

  // 세션 발급
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(userSessions).values({ token, userId: user.id, expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

/** 현재 로그인한 유저 (없으면 null) */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(eq(userSessions.token, token), gt(userSessions.expiresAt, new Date())),
    )
    .limit(1);
  return row?.user ?? null;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(userSessions).where(eq(userSessions.token, token));
  }
  jar.delete(SESSION_COOKIE);
}
