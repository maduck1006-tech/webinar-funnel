# UX 보완 체크리스트 (전체 감사)

작성: 2026-09-02 · 기준 커밋: `901295f`
범위: 사용자 퍼널 / 결제 / 로그인·보관함 / 공통·기술 / 관리자

우선순위: **P0** 전환·신뢰에 직접 타격 · **P1** 눈에 띄는 마찰 · **P2** 다듬기

## 진행 현황
- ✅ **P0 안전망** (커밋 `e0bea48`, 배포됨): A2 바운더리 · A3 Gate CTA · B2/B6 결제 에러 한국어화
- ✅ **P0 공유·유입** (커밋 `ab9ef88`, 배포됨): A1 캠페인별 메타/OG(Puck 자동추출) · A8/D1 viewport·theme-color · 퍼널 내부 페이지 noindex
- ✅ **P1 폼 마찰** (커밋 `dad7ee5`, 배포됨): lib/form-validate.ts 공용 · A6 LeadForm · B4 ContactStep · B1 결제 타임아웃 · B3 주문 요약 상시
- ✅ **P1 관리자** (커밋 `82fdcaf`, 배포됨): E1 SubmitButton(저장 중 상태) · E2 ConfirmSubmit(삭제 확인)
- ✅ **P2 배치 1** (커밋 대기): A8 focus-visible + reduced-motion · A4 booking iframe 로딩/실패 · OG 이미지 동적 폴백(/api/og)
- ⬜ P2 나머지: A5 종착 카피 · A7 만료 후 CTA 비활성 · C1 로그인 목적지 · C2 OTP 보조문구 · D2 폰트 · D3 next/image · E3 빈상태 · E4 어필리에이트 상세 · E5 모바일 관리자 · E6 표 검색

### 후속(선택)
- 캠페인별 SEO 오버라이드 컬럼(`seoTitle`/`seoDescription`/`ogImageUrl`) — 현재는 Puck 콘텐츠 자동 추출 + /api/og 폴백

---

## A. 사용자 퍼널 (landing → thankyou → vod → booking/groupchat/sales)

### A1. 소셜 공유 미리보기 없음 · 캠페인별 메타데이터 없음 — **P0**
- `src/app/layout.tsx` 의 고정 title "무료 강의 신청" 만 존재. `generateMetadata` 가 어디에도 없음.
- 카톡·문자·인스타 DM 으로 랜딩을 공유하면 제목·설명·썸네일이 안 나오거나 전부 동일.
- **할 일**: `[campaign]/page.tsx` + 루트 `page.tsx` 에 `generateMetadata` — 캠페인명·오퍼 한 줄·OG 이미지(캠페인 `heroImage` 또는 기본). `metadataBase` 설정. thankyou/vod 는 `robots: noindex`.

### A2. 에러·404·로딩 바운더리 없음 — **P0**
- `error.tsx` / `not-found.tsx` / `loading.tsx` / `global-error.tsx` 전무.
- DB 순간 오류·잘못된 링크 → Next 기본 흰 화면("Application error"). 광고비 태워 들어온 리드가 여기서 이탈.
- **할 일**: 퍼널 톤(`funnel-theme`)의 `error.tsx`(다시 시도 버튼 + 문자 문의 안내), `not-found.tsx`(홈/보관함 링크), `app/(funnel)/loading.tsx` 스켈레톤.

### A3. Gate 화면이 막다른 골목 — **P0**
- `Gate` 컴포넌트: 제목 + 회색 문장 한 줄뿐. CTA·다음 행동 없음.
  - "시청 링크가 필요합니다" → 로그인(`/login`) 버튼도, 문자 재발송도 없음.
  - "시청 기간이 종료되었습니다" → 재구매·문의 경로 없음. (개인별 마감 퍼널의 핵심 회수 포인트인데 비어 있음)
  - "예정된 회차가 없습니다 · 관리자에게 문의" → 사용자에게 관리자 문의를 시키는 건 실패.
- **할 일**: `Gate` 에 `action` prop 추가 — 만료 시 "다시 신청하기 / 결제하고 계속 보기", no-id 시 "로그인하고 이어보기" 버튼. 문의 채널(문자) 링크 상시 노출.

### A4. booking iframe 로딩·실패 상태 없음 — **P1**
- `src/components/funnel-views.tsx:432` `<iframe loading="eager" h-[720px]>` — 되는시간이 느리거나 죽으면 720px 빈 흰 박스.
- 모바일에서 720px 고정 높이는 스크롤 이중 발생.
- **할 일**: iframe 위 스켈레톤/스피너, `onLoad` 로 해제. 로드 실패 타임아웃 시 "예약 캘린더가 안 열리면 여기로" 대체 링크. 높이는 `min-h` + 자동.

### A5. groupchat / delivery 종착 페이지 — **P1**
- 무료 단톡방(`GroupChatView`): 링크 없을 때 관리자용 안내문이 사용자에게 그대로 노출("캠페인 설정에 …입력하면").
- 이 페이지가 "무료 티어"의 최종 목적지인데 환영·기대설정·다음 단계(유료 안내 등) 카피 훅이 약함 (Puck 기본값 점검 필요).
- **할 일**: 링크 미설정 시 사용자에게는 "입장 안내를 곧 문자로 보내드려요"로 폴백. Puck 기본 블록에 카톡방 입장 버튼 + "들어오면 이것부터" 3줄.

### A6. LeadForm — **P1**
- `src/puck/blocks/LeadForm.tsx`
  - 인라인 검증 없음: 이메일 오타·전화 자릿수 오류를 서버 400 받고 나서야 "잠시 후 다시 시도해 주세요"(원인 안 알려줌).
  - 전화번호 입력 마스킹 없음(로그인 화면엔 `formatPhone` 있는데 여기엔 없음 — 일관성 결여).
  - sticky 바가 "기본 노출"이라 첫 스크롤 전에도 하단을 가림 → 첫 화면 콘텐츠 잘림.
  - 제출 실패 시 `setLoading(false)` 만, 입력값은 유지되나 버튼 문구가 원복돼 재시도 유도가 약함.
  - 성공 후 `router.push` 만 — 네트워크 느리면 "눌렸나?" 무반응 구간.
- **할 일**: onBlur 필드 검증 + 필드별 에러문구, 전화 자동 하이픈, sticky 는 첫 스크롤(또는 400px) 후 등장, 제출 성공 시 버튼 "완료 ✓ 이동 중…".

### A7. 카운트다운 — **P2**
- `UrgencyBar` / `CountdownTimer` 만료 도달 시 처리 확인 필요: "00:00" 고정인지, 오퍼가 실제로 닫히는지, "마감되었습니다" 상태로 바뀌는지.
- evergreen `rushSeconds` 는 새로고침하면 리셋되는지(쿠키 앵커 유무) 점검.
- **할 일**: 만료 후 상태(문구 교체 + CTA disable 또는 정가 표기) 명시. evergreen 앵커를 쿠키로 고정.

### A8. 접근성·모바일 공통 — **P1**
- `viewport` export 없음 (Next 15 는 `metadata` 와 분리) → `themeColor`, `viewport` 미설정.
- 다크 테마인데 `<meta name="theme-color">` 없어 모바일 브라우저 상단바가 흰색으로 뜸.
- 이모지 아이콘(📄🎬💬)에 `aria-hidden` 없음, 장식 화살표 `→` 도 혼재.
- CTA 버튼 `active:scale` 만 있고 `focus-visible` 링 없음(키보드 탭 이동 시 어디 있는지 안 보임).
- **할 일**: `export const viewport` + `themeColor` 다크값, `prefers-reduced-motion` 시 `fn-in` 애니메이션 정지, 전 CTA 에 `focus-visible:ring`.

---

## B. 결제 (`/checkout`)

### B1. "결제 진행 중…" 이후 무한 대기 가능 — **P0**
- `CheckoutClient.tsx:643` `pay()` 실패는 `catch` 하지만, 토스 위젯 리다이렉트가 느리거나 팝업 차단되면 버튼만 비활성 + 스피너 없이 멈춤.
- `PAY_PROCESS_CANCELED` 는 무시(정상)인데, 그 외 취소 계열 코드 누락 시 에러문구에 raw SDK 메시지 노출("... PAY_PROCESS_ABORTED ...").
- **할 일**: 결제 버튼에 스피너, 30초 타임아웃 후 "결제창이 안 뜨면 팝업 차단을 확인해 주세요" + 재시도. SDK 에러코드→한국어 매핑 테이블.

### B2. 위젯 로드 실패 시 raw 에러 — **P0**
- `setErr(String(e))` 두 곳(위젯 초기화, 멤버십). 사용자에게 `[object Object]` 나 영문 스택 노출 가능.
- clientKey 없을 때 문구가 "관리자: NEXT_PUBLIC_TOSS_CLIENT_KEY 설정 필요" — 사용자에게 내부 env 이름 노출.
- **할 일**: 사용자용 문구("결제 시스템을 불러오지 못했어요. 새로고침하거나 잠시 후 다시…")와 콘솔 로그 분리.

### B3. 주문 요약이 접힘 — **P1**
- 쿠폰·범프가 **둘 다 없으면** 합계 줄 자체가 안 보임(`{(coupon || (withBump && bump)) && ...}`). 사용자는 "얼마 내는지" 확인 없이 결제 버튼으로.
- 버튼에 `${won(amount)} 결제하기` 는 있으나, 상품가=결제가일 때 "받는 것"의 요약(포함 항목·환불 정책·접근 기간)이 없음.
- **할 일**: 합계 줄 상시 노출. 상품 `accessDays`·`delivery` 를 "즉시 다운로드" / "N일 시청" 뱃지로. 환불/문의 한 줄 고정.

### B4. 연락처 단계(ContactStep) — **P1**
- 필드 3개 인라인 검증 없음(LeadForm 과 동일 문제). 전화 8자 이상만 체크.
- 퍼널에서 넘어오면 프리필되지만, 프리필된 값이 "수정 가능한지" 시각적 신호 없음.
- `/checkout` 직접 진입(광고 → 세일즈 → 결제) 시 이 단계가 첫인상인데 "왜 정보를 먼저 받는지" 설명 없음.
- **할 일**: 필드 검증 + 하이픈, "결제 후 이 번호로 시청 링크가 갑니다" 안내.

### B5. 멤버십 — **P1**
- 현재 docs 테스트키로는 `requestBillingAuth` 자체가 실패 → 사용자가 "0원으로 시작하기" 눌러도 에러. (키 교체 전까지 이 CTA 가 노출되면 안 됨)
- 카드 등록 성공 후 첫 청구일·해지 방법이 텍스트 한 줄뿐. `/library` 멤버십 행에서 "해지" 동선 확인 필요.
- **할 일**: 빌링 키 없으면 멤버십 상품 결제 버튼 비활성 + "준비 중" 처리. 첫 청구일을 날짜로 표기. `/library` 에 해지·다음 결제일 노출.

### B6. 결제 실패 페이지 `/checkout/fail` — **P1**
- `redirectFail` 이 `code`, `message` 쿼리로 보냄 → 사용자 URL 에 `AMOUNT_MISMATCH` 같은 내부 코드 + 영문 노출.
- **할 일**: fail 페이지가 코드→한국어 매핑, "다시 시도 / 다른 수단 / 문자 문의" 3버튼, 원 상품 링크 유지.

### B7. upsell/downsell 원클릭 — **P2**
- `/checkout/upsell` 진입 시 로딩·이탈 방지(뒤로가기 시 이중 청구?) 동선 점검.
- "안 살게요" 링크가 눈에 띄는지(다크패턴 회피).

---

## C. 로그인 / 보관함 (`/login`, `/library`)

### C1. 로그인 후 목적지 혼란 — **P1**
- `next` 파라미터만 신뢰. 문자 매직링크가 `/vod?l=` 을 열려다 만료돼 `/login` 으로 튕기면, 로그인 후 다시 만료된 `/vod` 로 → 무한 왕복.
- **할 일**: 로그인 성공 후 `next` 가 만료 자원이면 `/library` 로 폴백. `/login` 에 "지금 뭘 보려던 거였는지" 컨텍스트 한 줄.

### C2. OTP 입력 UX — **P2**
- 6자리 단일 인풋 + `letter-spacing` 로 칸처럼 보이게 함. iOS SMS 자동입력(`one-time-code`)은 걸려 있음 — 실제 자동채움 동작 확인 필요.
- 재전송 쿨다운 60초는 있으나, "문자가 안 와요" → 스팸함·번호 확인 안내 없음.
- 코드 3회 이상 틀리면 무슨 일이 나는지(잠금?) 사용자에게 안 보임.
- **할 일**: "1분 내 안 오면 스팸함 확인 / 번호 바꾸기" 보조 문구, 남은 시도 횟수 표시.

### C3. 보관함 빈 상태 / 크로스셀 — **P2**
- 빈 상태 카피는 좋음. 다만 "결제한 번호가 맞는데도 비어있는" 경우(엔타이틀먼트 미부여 — QA 에서 발견된 케이스) 자가 복구 불가.
- 크로스셀 카드 `bg-[var(--fn-accent)]/8` — accent 8% 가 다크에서 거의 안 보일 수 있음. 대비 확인.
- **할 일**: 빈 상태에 "결제는 했는데 안 보여요" → 문자 문의 딥링크(주문번호 자동 첨부). 크로스셀 대비 상향.

### C4. 로그아웃/세션 — **P2**
- 60일 쿠키. 공용 PC 고려한 "로그아웃" 노출은 됨(`LogoutButton`). 로그아웃 후 랜딩 아닌 `/login` 으로.

---

## D. 공통 · 기술

### D1. `viewport` / `themeColor` / PWA 메타 — **P1** (A8 과 연결)
- manifest 없음, apple-touch-icon 없음, `theme-color` 없음.

### D2. 폰트 로딩 — **P2**
- `IBM_Plex_Sans_KR` + `Geist` + `Geist_Mono` 3종 로드. 한글 본문에 Geist(라틴)만 fallback 이면 FOUT/자간 튐. `display:swap` 은 있음.
- **할 일**: 한글 우선 `font-family` 순서 점검, 미사용 웨이트 제거.

### D3. 이미지 — **P2**
- `next/image` 대신 `<img>` + eslint-disable 다수(`library`, `CheckoutClient`). LCP·CLS 손해.
- **할 일**: 최소한 히어로/썸네일은 `next/image` 또는 `width/height` + `loading` 지정.

### D4. 스크롤 복원 / 뒤로가기 — **P2**
- 퍼널 단계 이동이 `router.push` — 뒤로가기 시 이전 단계 상태(폼 값) 소실. 결제 취소 후 `/checkout` 복귀 시 step 초기화.

### D5. 로딩 스켈레톤 (서버 컴포넌트) — **P1**
- 모든 퍼널 뷰가 `async` 서버 컴포넌트 + 다수 DB 쿼리(`offerDeadlineIso`, `getActiveOffer`, `getRegisteredEvent`…). TTFB 동안 완전 백지.
- **할 일**: 라우트 그룹별 `loading.tsx` (토스트바 + 히어로 스켈레톤).

---

## E. 관리자

### E1. 저장 피드백 없음 — **P1**
- 서버 액션 `revalidatePath` 만. 폼 저장 후 성공 토스트·인라인 확인이 없어 "저장됐나?" 불확실. (쿠폰·상품·어필리에이트·캠페인 설정 전반)
- **할 일**: `useFormStatus` pending 상태 + 저장 후 "저장됨" 인라인 뱃지 (2초). 최소한 버튼 `disabled + "저장 중…"`.

### E2. 파괴적 액션 확인 없음 — **P1**
- "삭제" 버튼들(`deleteCoupon`, 캠페인·상품·이벤트) — `confirm()` 조차 없음. 오클릭 즉시 삭제.
- **할 일**: 공용 `<ConfirmButton>` (한 번 더 클릭 or 모달).

### E3. 빈 상태 / 온보딩 — **P2**
- 신규 관리자가 "오늘" 화면부터 봄. 캠페인 0개일 때 "여기서 시작하세요" 동선(캠페인 만들기 → 템플릿) 강조 필요.
- 표 `EmptyRow` 는 텍스트만. "첫 상품 만들기" 같은 액션 버튼 없음.

### E4. 어필리에이트 페이지 (신규) — **P2**
- 추천 링크 복사 버튼 없음(`<code>` 텍스트만) — `CopyField` 컴포넌트 이미 있으니 적용.
- 커미션 "지급완료"가 되돌리기 불가 + 확인 없음 (E2 와 동일).
- 어필리에이트별 상세(추천 리드 목록·주문)를 만들어 뒀으나(`getAffiliateDetail`) 페이지에서 안 씀 — 행 클릭 시 상세 드로어.

### E5. 모바일 관리자 — **P2**
- `w-52` 고정 사이드바 + `px-8` — 폰에서 관리자 확인 시 깨짐. 최소한 표는 `overflow-x-auto`.

### E6. 표 정렬·검색·필터 — **P2**
- CRM/주문 목록에 정렬·검색 유무 점검. 리드 수백 넘어가면 필수.

---

## 권장 진행 순서

1. **P0 묶음 1 — 안전망**: A2(error/not-found/loading) + A3(Gate CTA) + B2/B6(결제 에러 문구·fail 페이지). 이탈 방어.
2. **P0 묶음 2 — 공유·유입**: A1(generateMetadata + OG) + A8/D1(viewport·theme-color).
3. **P1 묶음 — 폼 마찰**: A6 + B4(인라인 검증·전화 하이픈 공용화) + B1(결제 타임아웃) + B3(주문 요약 상시).
4. **P1 관리자**: E1(저장 피드백) + E2(삭제 확인).
5. **P2**: 나머지 다듬기.
