/**
 * 사업자 정보 (전자상거래법·카카오 비즈니스 채널 심사용 푸터에 표시).
 * 기본값은 사업자등록증(런치스케일) 기준. 필요 시 env 로 덮어쓴다.
 */
export const business = {
  name: process.env.NEXT_PUBLIC_BIZ_NAME || "런치스케일",
  owner: process.env.NEXT_PUBLIC_BIZ_OWNER || "김영진",
  regNo: process.env.NEXT_PUBLIC_BIZ_REG_NO || "163-17-02568",
  address:
    process.env.NEXT_PUBLIC_BIZ_ADDR ||
    "강원특별자치도 원주시 동부순환로 261, 4층 4호 A22(행구동)",
  tel: process.env.NEXT_PUBLIC_BIZ_TEL || "010-5196-0889",
  email: process.env.NEXT_PUBLIC_BIZ_EMAIL || "maduck1006@gmail.com",
  /** 통신판매업 신고번호. 미신고(간이과세자 면제 대상)면 빈 값 → "신고 면제 대상" 문구 표시 */
  mailOrderNo: process.env.NEXT_PUBLIC_BIZ_MAIL_ORDER_NO || "",
} as const;
