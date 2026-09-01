# 멀티 상품 퍼널 설계 (클릭퍼널스형 확장)

**버전:** v0.2 (초안) · **작성일:** 2026-09-02 · **상태:** 검토 대기

현재 `campaigns` 은 **"에버그린 웨비나 오퍼 한 벌"** 로 고정돼 있다:
신청(landing) → 땡큐(thankyou) → VOD 시청(vod, 48h) → **1:1 예약(booking)**, 중간에 저가 워크북 범프.

이걸 러셀 브런슨 클릭퍼널스처럼 **여러 종류의 퍼널**을 한 엔진으로 돌리도록 일반화한다.

| 팔려는 것 | 지금 | 목표 |
|---|---|---|
| 무료강의 → 넥스트스텝 | ✅ 종착이 1:1 예약 고정 | 종착을 **단톡방 입장 / 1:1 예약 / 유료 세일즈** 중 선택 |
| 라이브 웨비나 **신청** | ❌ | 외부(줌 등)에서 여는 라이브의 **신청·리마인더·리플레이** 퍼널 |
| VOD 강의 | ❌ (48h 무료 리플레이만) | 강의 판매 → 강의실(수강) |
| 전자책 | ❌ | 판매/트립와이어 → 다운로드 |
| 1:1 상담 | ✅ (무료 예약) | + 유료 상담 단독 판매 |

> **중요:** 라이브 웨비나는 **이 앱에서 진행하지 않는다.** 앱은 신청서를 받고, 일정을 안내하고, 리마인더를 보내고, 라이브 종료 후 리플레이를 자동으로 여는 **신청 퍼널**만 담당한다. 라이브 방송 자체는 줌/유튜브 라이브 등 외부.

---

## 0. 핵심 아이디어

1. **퍼널 타입(`funnel_type`)** — 캠페인마다 "무슨 퍼널인지"를 정하면 페이지 시퀀스·전환 목표·기본 자동화·추적 이벤트가 따라온다.
2. **종착 스텝(`terminal_step`)** — 웨비나형 퍼널(에버그린/라이브신청)의 마지막 단계를 캠페인 설정으로 선택: `groupchat`(단톡방) · `booking`(1:1) · `sales`(유료 오퍼).
3. **상품 타입 + 전달(delivery)** — `products.type` 으로 워크북/강의/전자책/상담/멤버십 구분. 각 타입이 "결제 후 무엇을 주는가"를 안다.
4. **엔타이틀먼트(`entitlements`)** — "이 사람이 이 상품에 접근 권한 있음"의 단일 원장. **유료 상품(강의·전자책·유료상담)** 판매부터 필요. 단톡방·무료강의는 불필요.

용어: `campaigns` 를 말로는 "퍼널"이라 부르되 **테이블명은 유지**한다. 기존 흐름은 `funnel_type='evergreen_webinar'`, `terminal_step='booking'` 으로 자동 편입 — 깨지는 것 없음.

---

## 1. 퍼널 타입

| `funnel_type` | 시퀀스 | 전환 목표(북극성) | 종착 |
|---|---|---|---|
| `evergreen_webinar` | landing → thankyou → **vod(48h)** → `{terminal}` | 종착 완료 | 선택 |
| `live_webinar_reg` | landing → thankyou(일정·외부링크·캘린더) → *(라이브는 외부)* → **replay(자동전환)** → `{terminal}` | 신청 → (참석) → 종착 | 선택 |
| `vod_course` | **sales** → checkout → (upsell → downsell) → thankyou → **members** | Purchase | — |
| `ebook` | **sales** 또는 opt-in → (checkout) → thankyou → **delivery** | Purchase (무료면 Lead) | — |
| `paid_consult` | **sales** → checkout(유료) → thankyou → **booking**(엔타이틀먼트 게이트) | 예약 완료 | — |

`{terminal}` = `terminal_step` 설정값:

| `terminal_step` | 페이지 | 동작 |
|---|---|---|
| `groupchat` | `/{slug}/community` | 무료 단톡방(오픈카톡) 입장 안내. **링크 즉시 공개.** "곧 방장이 수락합니다" 는 연출 문구 |
| `booking` | `/{slug}/booking` | 되는시간 임베드 1:1 예약 (현재 동작) |
| `sales` | `/{slug}/sales` | 유료 상품 세일즈페이지로 |

---

## 2. 페이지 타입 확장

현재 enum: `landing | thankyou | vod | booking | membership`

추가:

| page_type | 렌더 | Puck 편집 | 용도 |
|---|---|---|---|
| `groupchat` | Puck + 링크 슬롯 | ✅ | 단톡방 입장 안내 + CTA(단톡방 URL). 무료·게이트 없음 |
| `sales` | Puck | ✅ | 유료 상품 세일즈레터(장문). CTA = `{{checkout}}` |
| `delivery` | Puck + 다운로드 슬롯 | ✅ | 전자책/자료 서명 다운로드 |
| `upsell` | Puck + 1클릭결제 슬롯 | ✅ | 결제 직후 OTO. `products.upsellProductId` |
| `downsell` | Puck + 1클릭결제 슬롯 | ✅ | 업셀 거절 시. `products.downsellProductId` |
| `members` | 앱 렌더(+ Puck 히어로 슬롯) | 부분 | 강의실 — 모듈/레슨 트리 + 플레이어 + 진도 |

- `vod` page_type 은 **재사용**: 에버그린은 신청+48h, 라이브신청은 이벤트 종료 후 리플레이. 게이팅만 분기.
- ~~`live`~~ 없음 — 라이브는 외부 진행.
- `checkout` 은 지금처럼 Puck 아님, 독립 라우트(`/checkout?p=&l=`). 퍼널 스텝으로는 설정·리다이렉트만.

---

## 3. 라우팅

### 3-1. 점진 모델 (추천 시작점)

기존처럼 page_type 별 라우트 파일 유지 + 신규 추가:

```
/{slug}            landing
/{slug}/thankyou   thankyou
/{slug}/vod        vod         (에버그린 48h / 라이브 리플레이 — funnel_type 로 게이팅 분기)
/{slug}/community  groupchat   ← 신규
/{slug}/booking    booking
/{slug}/sales      sales       ← 신규
/{slug}/course     members     ← 신규 (P2)
/{slug}/download   delivery    ← 신규 (P1)
/{slug}/upsell     upsell      ← 신규 (P2)
/{slug}/downsell   downsell    ← 신규 (P2)
```

- `funnel_type` + `terminal_step` 이 "활성 page_type"과 `/{slug}` 및 각 단계의 다음 링크·리다이렉트 기본값을 결정.
- VodView 마지막 CTA / thankyou 다음 스텝이 `terminal_step` 을 읽어 `community | booking | sales` 로 분기.

### 3-2. 목표 모델 (P4 리팩터)

`funnel_steps` 테이블 + `/{campaign}/[[...step]]` 단일 라우트로 데이터 주도화. 흐름도가 스텝을 편집. (상세는 §8 P4)

---

## 4. 데이터 모델 변경

### 4-1. campaigns

```sql
ALTER TABLE campaigns ADD COLUMN funnel_type    text NOT NULL DEFAULT 'evergreen_webinar';
ALTER TABLE campaigns ADD COLUMN terminal_step  text NOT NULL DEFAULT 'booking';  -- groupchat | booking | sales
ALTER TABLE campaigns ADD COLUMN group_chat_url text;   -- 오픈카톡 등 단톡방 초대 링크
ALTER TABLE campaigns ADD COLUMN flow           jsonb;  -- 스텝 순서·링크 (흐름도, P4 다리)
-- 기존 vod_src / booking_embed_url / download_url / checkout_redirect_url 유지.
```

### 4-2. products — 타입 + 전달 (P1~)

```sql
ALTER TABLE products ADD COLUMN type        text NOT NULL DEFAULT 'workbook';
  -- workbook | vod_course | ebook | coaching | membership
ALTER TABLE products ADD COLUMN delivery    jsonb;
  -- ebook:    { assetUrl, previewUrl?, pages? }
  -- coaching: { bookingEmbedUrl, sessions, durationMin }
  -- vod_course: courses 테이블로 (아래)
ALTER TABLE products ADD COLUMN access_days int;   -- 수강/열람 기한. null = 무제한
ALTER TABLE products ADD COLUMN price_mode  text NOT NULL DEFAULT 'paid';  -- paid | free | pwyw
```

`kind`(one_time|membership) 유지, `type` 과 직교.

### 4-3. entitlements — 신규 (유료 상품 판매 시작 시 · P0)

```sql
entitlements
  id              uuid pk
  lead_id         uuid fk
  user_id         uuid fk null       -- 매직링크 인증 도입 후 채움
  product_id      uuid fk
  source_order_id uuid fk null       -- 무료옵트인/수동부여면 null
  kind            text                -- course | ebook | coaching | membership
  status          text                -- active | revoked | expired
  granted_at      timestamptz
  expires_at      timestamptz null    -- product.access_days 로 계산, null = 평생
  meta            jsonb               -- { downloadCount, bookingUsed, ... }
  unique(lead_id, product_id)
```

부여 지점: `/api/toss/confirm` 결제확정 · 무료 opt-in · 관리자 수동 · 크론(만료).
게이트: `members` / `delivery` / 유료 `booking` 뷰가 `hasEntitlement(leadId, productId)` 확인.
**단톡방·무료강의(vod 48h)는 엔타이틀먼트 불필요** — 기존 `vodExpiresAt` / 링크 그대로.

### 4-4. courses — VOD 강의 (P2)

```sql
courses          id, product_id fk unique, title, description, updated_at
course_modules   id, course_id fk, sort_order, title
course_lessons   id, module_id fk, sort_order, title,
                 video_provider,  -- mux | youtube | vimeo | blob
                 video_ref, duration_sec, resources jsonb,
                 is_preview bool default false,  -- 비구매자 맛보기
                 drip_days int default 0         -- 부여일+N일 후 오픈
lesson_progress  id, lead_id fk, lesson_id fk, seconds, completed_at,
                 unique(lead_id, lesson_id)
```

### 4-5. events — 라이브 웨비나 신청 (P3)

```sql
events
  id uuid pk, campaign_id fk,
  starts_at timestamptz, timezone text default 'Asia/Seoul', duration_min int,
  external_live_url text,      -- 줌/유튜브 라이브 — thankyou·리마인더에 노출
  replay_opens_at timestamptz, -- 보통 starts_at + duration. 이후 /{slug}/vod 활성
  replay_window_hours int default 48,
  status text                  -- scheduled | ended
event_registrations
  id uuid pk, event_id fk, lead_id fk,
  registered_at timestamptz, attended_at timestamptz null,  -- 참석은 수동/추정
  unique(event_id, lead_id)
```

- **리플레이 자동 전환:** `/{slug}/vod` 가 `funnel_type='live_webinar_reg'` 이면 `now >= replay_opens_at` 체크 → 이전엔 "리플레이는 라이브 종료 후 공개됩니다 + 카운트다운", 이후엔 기존 VOD 뷰(기한 = `replay_opens_at + replay_window_hours`).
- 리마인더는 `event.starts_at` 앵커: T-24h / T-1h / T-10m / "지금 시작" / "리플레이 열림" / "리플레이 마감 D-1".

### 4-6. end-user 인증 — 신규 (유료 상품 판매 시 · P0)

`?l=` + `fnl` 쿠키는 48h 리플레이엔 충분하나 "지난주 산 강의를 폰으로 다시"를 못 버틴다.

```sql
users          id, email unique, name, phone, created_at, last_login_at
-- leads.user_id uuid fk null (이메일로 매칭/생성)
user_sessions  token pk, user_id fk, expires_at, created_at
```

**방식: 이메일 매직링크(추천).** `/login` 이메일 입력 → 서명된 1회용 링크(솔라피 이메일/알림톡) → 세션 쿠키. 대안: 휴대폰 OTP(솔라피). Clerk 엔드유저 확장은 비용/복잡도로 보류.
**크로스 퍼널 라이브러리:** `/library` — 로그인 사용자의 보유 강의·전자책·리플레이·상담권 한 화면.

---

## 5. 결제 일반화 (P1~)

`/checkout?p=&l=` 는 이미 금액검증·멱등·오더범프·1클릭 업셀(빌링키)·다운셀 처리. 추가:

| 추가 | 내용 |
|---|---|
| **결제 후 부여** | `confirm` 성공 → `product.type` 보고 `entitlements` 부여 + 전달 트리거(강의링크/전자책 다운로드 메일) + Purchase 추적 + 구매후 자동화 enroll |
| **무료 상품** | `price_mode='free'` → 체크아웃 스킵, opt-in(`/api/leads`) 직후 부여 → delivery |
| **업셀/다운셀** | page_type 승격, `products.upsell/downsellProductId`, 1클릭 결제(토스 빌링키 — docs/toss-payments-plan.md §P2 재사용) |
| **유료 상담** | `type='coaching'` → 결제 후 `entitlements(kind=coaching)` → `/{slug}/booking` 게이트 + 예약 시 `meta.bookingUsed` |

---

## 6. 자동화 / 추적

### 자동화 (docs/messaging-unification-plan.md 엔진 재사용)

`messageAutomationTrigger` enum 확장:
- `entitlement_granted` (anchor: granted_at) — 강의/전자책 구매자 온보딩
- `event_reminder` (anchor: event.starts_at, 음수 오프셋 허용) — 라이브 웨비나 신청
- `lesson_stalled` (anchor: 마지막 진도, N일 정체) — 강의 완주 유도 (P2 후반)

`messageAudience` 확장: `not_started_course` · `not_downloaded` · `not_joined_chat` · `not_attended`.
문자 변수 추가: `{단톡방링크}` · `{강의실링크}` · `{다운로드링크}`(이미 있음).
퍼널 타입별 **기본 자동화 세트**를 시드로 제공 → 새 캠페인 생성 시 타입에 맞게 복제.

### 추적

| funnel_type | Lead | InitiateCheckout | Purchase | 종착 |
|---|---|---|---|---|
| evergreen_webinar | 신청 | (범프) 결제버튼 | ?paid=1 | groupchat=커스텀 `JoinGroup` / booking=Schedule / sales=Purchase |
| live_webinar_reg | 신청 | — | 리플레이 오퍼 결제 | `CompleteRegistration` + 종착별 |
| vod_course | opt-in 시 | sales CTA | confirm | — |
| ebook | 무료면 여기 | sales CTA | confirm | — |

---

## 7. 관리자 IA 추가

```
/admin
  /campaigns/new         → 1단계: 퍼널 타입 선택 → 2단계: 템플릿/복제
  /campaigns/[id]/settings
      evergreen_webinar   → 영상·48h·종착(단톡방URL / 되는시간 / 세일즈)·상품범프
      live_webinar_reg    → 이벤트 일정·외부 라이브 URL·리플레이 창·리마인더·종착
      vod_course          → 강의 연결·업셀/다운셀
      ebook               → 파일 업로드·무료/유료·미리보기
  /campaigns/[id]/flow    → 타입의 스텝 시각화 + 링크 편집
  /products/[id]          → type + delivery 설정
  /products/[id]/course   → (vod_course) 모듈/레슨 CRUD + 영상 업로드 + 드립
  /events                 → 라이브 웨비나 일정 + 등록자 현황 + 리플레이 URL 입력
  /crm/[id]               → 엔타이틀먼트 탭 + 수동 부여/회수 + 강의 진도
/login /library           (엔드유저용)
```

---

## 8. 단계별 실행

| Phase | 범위 | 완료 기준 | 블로커 |
|---|---|---|---|
| **P0′ 단톡방 종착 (즉시)** | `terminal_step` + `group_chat_url` 컬럼 · `groupchat` page_type · `/{slug}/community` 라우트 · VodView/thankyou 다음 스텝 분기 · `{단톡방링크}` 문자 변수 · 관리자 설정에 종착 선택 UI | 현재 무료강의 퍼널의 종착을 **단톡방 입장**으로 전환 (에버그린: 신청 → 48h VOD → 단톡방) | 없음 — 무료라 인증·결제 불필요 |
| **P0 기반** | `funnel_type` 컬럼 · `entitlements` · `products.type/delivery/access_days/price_mode` · 매직링크 인증(`users`/`user_sessions`) · `/login` · `/library` · `grantEntitlement` + `confirm` 배선 | 기존 흐름 무변화 + 결제 시 엔타이틀먼트 1행 + 로그인해서 /library 열림 | 이메일/알림톡 발송(솔라피 기존) |
| **P1 전자책** | `type=ebook` · Blob 파일 업로드 · `sales` + `delivery` page_type · 서명 다운로드 · 무료(opt-in)/유료 분기 · 전달 메일 · 기본 자동화 세트 | 전자책 1개를 새 캠페인으로 유료·무료 둘 다 판매/전달 | 없음 (먼저) |
| **P2 VOD 강의** | `courses/modules/lessons/lesson_progress` · `/{slug}/course` 강의실 · 영상 연동 · `upsell`/`downsell` + 1클릭결제 · 드립(선택) | 강의 판매 → 결제 → 강의실 수강 → 진도 저장 · 업셀 1건 태움 | **영상 호스팅 결정**(Mux / 유튜브 비공개 / Vimeo / Blob) |
| **P3 라이브 웨비나 신청** | `events/event_registrations` · `/{slug}/vod` 리플레이 자동전환 · 이벤트 앵커 리마인더 크론 · thankyou 일정·외부링크·캘린더(.ics) · 참석 현황 | 날짜 잡힌 라이브 신청 → 리마인더 → (외부 참석) → 리플레이 자동공개 → 종착 | 외부 라이브 플랫폼(줌/유튜브) 확정 |
| **P4 통합·고급** | 라우팅 데이터화(`funnel_steps` + `[[...step]]`) · 크로스셀/번들 · 쿠폰 · 어필리에이트 · 스텝별 A/B | 클릭퍼널스급 조합 자유도 | P1~P3 안정화 |

**추천:** P0′ 로 지금 퍼널을 단톡방 종착으로 바꾸고 → P0/P1 로 유료 상품(전자책) 스파인 검증 → P2 강의 → P3 라이브 신청 → P4 리팩터.

---

## 9. 열린 질문

1. **강의 영상 호스팅**: Mux(유료·DRM·분석) vs 유튜브 비공개 vs Vimeo vs 자체 Blob mp4. → P2 전 결정.
2. **외부 라이브 플랫폼**: 줌 웨비나 vs 유튜브 라이브 vs 구글밋. 캘린더(.ics)·입장 링크 노출 방식이 여기서 갈림.
3. **엔드유저 인증**: 매직링크(이메일) vs 휴대폰 OTP(솔라피). → 매직링크 가정.
4. **전자책 파일 보호**: 만료 서명 URL만 vs 구매자 워터마킹. → v1 은 서명 URL.
5. **유료 상담**: 노쇼/환불 정책, 되는시간 연동 유지 여부.
6. **리드 통합**: 같은 이메일이 여러 퍼널 유입 → `users.email` 유니크로 느슨하게 통합 가정.
7. 단톡방을 여러 개(캠페인마다 다른 방) 쓰나, 아니면 공용 1개인가. → `campaigns.group_chat_url` 로 캠페인별 가정.

---

## 10. 이번 확장이 건드리지 않는 것

- 결제 서명 검증·멱등(`src/lib/toss.ts`, `/api/toss/confirm`) — 부여 훅만 추가
- 멀티 캠페인 라우팅·A/B·광고 귀속·Meta CApI — 그대로
- 자동 메시지 엔진 구조 — enum 값만 추가
- 이미지/파일 업로드(Vercel Blob) — 전자책·강의 자료도 같은 경로 재사용
- 관리자 인증(Clerk) — 엔드유저 인증은 완전 별도 레이어
- 기존 캠페인 — `funnel_type='evergreen_webinar'` + `terminal_step='booking'` 기본값으로 자동 편입, 동작 불변
