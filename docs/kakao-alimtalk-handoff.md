# 카카오 알림톡 — 외주 인수인계

> 코드는 다 들어가 있습니다. 남은 건 **채널 개설 · 환경변수 · 템플릿 승인**입니다.
> 코드 수정 없이 아래 3가지만 하면 알림톡이 동작합니다.

## 현재 상태

| 항목 | 상태 |
|---|---|
| DB 스키마 (`kakao_templates`, `message_automation_steps.channel` 등) | ✅ 프로덕션 반영 완료 (`scripts/ddl-kakao-alimtalk.ts`) |
| 발송 로직 (`src/lib/solapi.ts` `sendMessage`) | ✅ 알림톡 시도 → 실패 시 문자 대체 |
| 관리자 화면 `/admin/settings/kakao` | ✅ 채널 상태 · 템플릿 목록 · 동기화 |
| 자동 메시지 편집기의 "발송 채널" 선택 | ✅ 문자 / 알림톡 + 변수 매핑 |
| **카카오 채널** | ❌ 미개설 |
| **환경변수 `SOLAPI_KAKAO_CHANNEL_ID`** | ❌ 미설정 |
| **알림톡 템플릿** | ❌ 미등록 |

---

## 1. 카카오 채널 개설 + 솔라피 연동

1. [카카오 비즈니스](https://business.kakao.com)에서 **런치스케일 채널** 생성 → 검색용 아이디 확보
2. [솔라피 콘솔](https://console.solapi.com) → **카카오 채널** → 채널 추가
   - 채널 관리자 휴대폰으로 인증번호를 받아 연동
3. 연동되면 **채널 ID(pfId, `KA01PF...`)** 가 발급됨

## 2. 환경변수

Vercel 프로젝트 → Settings → Environment Variables → **Production**에 추가:

```
SOLAPI_KAKAO_CHANNEL_ID = KA01PF...    (1번에서 받은 채널 ID)
```

`SOLAPI_API_KEY` / `SOLAPI_API_SECRET`은 이미 있음 (문자 발송용과 동일).
**추가 후 재배포** (`vercel --prod`)해야 반영됩니다.

배포되면 `/admin/settings/kakao`의 "발신 채널"이 **연결됨**으로 바뀝니다.

## 3. 템플릿 등록 · 승인

솔라피 콘솔 → **알림톡 템플릿** → 템플릿 추가. 4개 우선 등록:

| 템플릿 | 용도 | 필요 변수 |
|---|---|---|
| 신청 확인 | 무료 강의 신청 직후 | `#{이름}` `#{시청링크}` |
| 결제 완료 | 결제 승인 직후 | `#{이름}` `#{상품명}` `#{다운로드링크}` |
| 라이브 안내 | 회차 신청자에게 | `#{이름}` `#{일시}` `#{강의내용}` + 링크 버튼 |
| 시청 기한 안내 | 무료 시청 마감 전 | `#{이름}` `#{마감시각}` `#{시청링크}` |

- **정보성 문구만.** "지금 결제하세요", "오늘까지 할인" 등 광고성은 반려됩니다.
- 버튼은 **링크형 → 변수 링크(`#{링크}`)** 로 만들면 개인별 추적 주소를 꽂을 수 있음
- 심사 **영업일 1~2일**

승인되면 `/admin/settings/kakao`에서 **"솔라피에서 템플릿 불러오기"** 클릭 →
`kakao_templates`에 저장됨 → 자동 메시지 편집기에서 선택 가능.

---

## 동작 방식 (코드)

### 발송 경로

`src/lib/messaging.ts` `sendStep()`:
1. 스텝의 `channel === "alimtalk"` && `kakaoTemplateId` 있으면
2. `kakao_templates`에서 템플릿 조회 (status APPROVED 만)
3. `kakaoVariableMap`(`{"강의명": "{상품명}"}`)을 실제 값으로 치환
4. `sendMessage(phone, body, { kakao: {...} })` 호출
5. `src/lib/solapi.ts`가 알림톡 시도 → 실패하면 `body`(문자 문구)로 자동 대체발송

즉 **승인 전에는 문자로 계속 나가고**, 편집기에서 채널을 알림톡으로 바꾸고
템플릿을 연결하는 순간부터 알림톡으로 전환됩니다. 롤백도 채널만 문자로 되돌리면 끝.

### 라이브 안내 (`/admin/campaigns/[id]/live`)

현재 `sendLiveNotice()`는 문자로만 나갑니다. 알림톡으로 바꾸려면
`src/lib/events.ts`의 `sendSms` 호출부를 `sendMessage(..., { kakao })`로 교체.
템플릿의 버튼 링크에 개인 추적 주소(`${SITE}/live/${token}`)를 변수로 꽂으면 됩니다.

### 관련 파일

```
src/lib/solapi.ts                         sendMessage · KakaoSend 타입
src/lib/kakao.ts                           채널 상태 · 템플릿 동기화 (server-only)
src/lib/messaging.ts                       sendStep 에서 알림톡 분기
src/db/schema.ts                           kakao_templates · message_automation_steps.channel/kakaoTemplateId/kakaoVariableMap
src/app/admin/(dash)/settings/kakao/       관리자 화면
src/app/admin/(dash)/automation/StepChannelField.tsx   편집기 채널 선택
scripts/ddl-kakao-alimtalk.ts              DDL (반영 완료)
```

### 솔라피 SDK 참고

- `solapiService().getKakaoChannel(channelId)` — 채널 조회
- `solapiService().getKakaoAlimtalkTemplates({ channelId, limit, startKey })` — 템플릿 목록
- `send({ ...base, kakaoOptions: { pfId, templateId, variables, disableSms } })` — 발송
  - `disableSms: false` 로 두면 알림톡 실패 시 솔라피가 문자로 대체 (추가 코드 불필요)
  - `variables` 키는 `#{강의명}` 형태 (중괄호 포함)

---

## 테스트

1. `SOLAPI_DRY_RUN=1` 로컬에서 `sendMessage` 호출 시 실제 발송 없이 로그만
2. 채널 연동 후 `/admin/settings/kakao`에서 동기화 → 템플릿 목록 확인
3. 자동 메시지 하나의 스텝을 알림톡으로 바꾸고 변수 매핑
4. 테스트 리드로 트리거 발생 → 카톡 도착 확인 (본인 번호가 채널 친구 아니어도 알림톡은 옴)
