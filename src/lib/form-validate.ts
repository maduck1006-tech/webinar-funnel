/**
 * 리드/주문 폼 공용 검증 · 표시 유틸 (클라이언트 안전 — server-only 아님).
 * LeadForm(Puck) 과 CheckoutClient ContactStep 이 같이 씀.
 */

/** 01012345678 → 010-1234-5678 (입력 중 표시용, 최대 11자리) */
export function formatPhoneKR(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 하이픈 제거한 숫자만 */
export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 필드별 에러 문구 (없으면 null) */
export function nameError(v: string): string | null {
  const s = v.trim();
  if (!s) return "이름을 입력해 주세요.";
  if (s.length > 40) return "이름이 너무 길어요.";
  return null;
}

export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s) return "이메일을 입력해 주세요.";
  if (!EMAIL_RE.test(s)) return "이메일 형식을 확인해 주세요. (예: name@example.com)";
  return null;
}

export function phoneError(v: string): string | null {
  const d = phoneDigits(v);
  if (!d) return "휴대폰 번호를 입력해 주세요.";
  if (!/^01[016789]/.test(d)) return "휴대폰 번호 형식을 확인해 주세요.";
  if (d.length < 10 || d.length > 11) return "휴대폰 번호 자릿수를 확인해 주세요.";
  return null;
}

export type LeadFields = { name: string; email: string; phone: string };

/** 전체 검증 — 각 필드 에러 맵 반환 (모두 null 이면 통과) */
export function validateLead(f: LeadFields) {
  return {
    name: nameError(f.name),
    email: emailError(f.email),
    phone: phoneError(f.phone),
  };
}

export function hasErrors(errs: Record<string, string | null>): boolean {
  return Object.values(errs).some(Boolean);
}
