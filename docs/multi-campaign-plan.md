# 멀티 캠페인(다중 랜딩페이지) 설계

**버전:** v0.1 (초안) · **작성일:** 2026-08-29 · **상태:** 검토 대기

현재는 랜딩페이지가 1개(고정 4단계: `/` `/thankyou` `/vod` `/booking`)다.
실제 운영은 광고/웨비나마다 별도 퍼널을 돌리므로 **캠페인 단위 멀티 퍼널**로 재설계한다.

## 결정된 사항 (사용자 확인)

| 항목 | 결정 |
|---|---|
| URL 구조 | **경로 방식** — `/{campaignSlug}`, `/{campaignSlug}/vod` … |
| 캠페인 규모 | **계속 늘어남** → 템플릿·복제·아카이브 체계 필요 |
| 전환 추적 | **Meta(페이스북) 픽셀 + GA4/Google Ads** |
| 캠페인별로 다른 것 | **VOD 영상 · 저가 상품 · 상담 캘린더 · 문자 문구 · 카운트다운** (사실상 전부) |

---

## 1. 개념 모델

- **캠페인(Campaign)** = 하나의 웨비나 오퍼 세트. 광고 → 랜딩(2) → 땡큐(3) → VOD(4) → 예약(5) 한 벌 + 설정 + 상품 매핑 + 문구.
- `slug` 로 식별, `/{slug}` 로 서빙.
- 새 캠페인은 **템플릿 또는 기존 캠페인 복제**로 생성.
- 상품·연동 키(래피드/솔라피/DB)는 **전역 자원**, 캠페인은 이를 매핑/오버라이드.

---

## 2. URL / 라우팅

```
/{slug}                 랜딩 (2단계)
/{slug}/thankyou        땡큐 + 저가상품 (3단계)
/{slug}/vod             VOD 시청 (4단계)
/{slug}/booking         상담 예약 (5단계)
/                       대표 캠페인(is_default)으로 rewrite  ← 외부에 노출되는 마케팅 URL
```

- Next 라우트: `src/app/(funnel)/[campaign]/…` 로 기존 페이지 이동.
- 예약어 가드: `admin` `api` `preview` `_next` `favicon.ico` 등은 slug 불가 (middleware + 생성 폼 검증).
- slug 변경 시 이전 slug → 신 slug 301 (광고 링크 보호). `campaign_slug_redirects` 테이블.
- 기존 `/thankyou` `/vod` `/booking` 은 대표 캠페인 경로로 rewrite 유지(하위호환).

---

## 3. 데이터 모델

```sql
campaigns
  id              uuid pk
  slug            text unique        -- [a-z0-9-]
  name            text
  status          text               -- draft | live | archived
  is_default      boolean            -- '/' rewrite 대상 (1개만 true)
  is_template     boolean            -- 복제 소스로 노출

  -- 콘텐츠 / 연동
  vod_src               text          -- 캠페인별 영상 (YouTube/Vimeo/MP4)
  vod_window_hours      int  default 48
  booking_embed_url     text          -- 캠페인별 되는시간 임베드
  checkout_redirect_url text          -- 결제 후 이동 (기본 /{slug}/vod)

  -- 카운트다운
  countdown_mode        text          -- none | fixed | evergreen
  countdown_deadline    timestamptz
  countdown_rush_seconds int

  -- 추적
  meta_pixel_id         text
  ga4_measurement_id    text
  google_ads            jsonb         -- {conversionId, labels:{lead,purchase,booking}}
  default_utm_campaign  text          -- 광고 링크 표준 utm_campaign

  created_at, updated_at timestamptz

campaign_pages            -- 기존 funnel_pages 대체
  id, campaign_id fk
  page_type    text        -- landing | thankyou | vod | booking
  version      int
  published    boolean
  data         jsonb       -- Puck Data
  unique(campaign_id, page_type, version)

campaign_products
  campaign_id fk, product_id fk
  placement   text         -- thankyou | vod_bottom | both
  -- 캠페인당 여러 상품 가능

campaign_messages          -- 자동화 문구 캠페인별 오버라이드 (row 없으면 전역 automation_triggers 사용)
  campaign_id fk
  trigger      text        -- reminder_24h | reminder_12h_left | ... | payment_success
  enabled      boolean
  template     text
  offset_hours int
  unique(campaign_id, trigger)

campaign_slug_redirects
  old_slug text pk, campaign_id fk

-- 기존 테이블 변경
leads   + campaign_id fk    (마이그레이션 시 nullable → backfill → not null)
orders  + campaign_id fk    (매칭된 lead 에서 파생)

-- automation_triggers: 전역 기본값으로 유지
```

---

## 4. 코드 영향 범위

| 영역 | 현재 | 변경 |
|---|---|---|
| 라우팅 | 고정 4 route | `(funnel)/[campaign]/…` 동적 |
| `getFunnelData(slug)` | page_type only | `(campaignId, pageType)` |
| `FunnelPage` | `slug` prop | `campaign` + `pageType`, 캠페인 설정을 Render metadata 로 주입 |
| `/api/leads` | 전역 | `campaign_id` 저장, 캠페인 `vod_window_hours` 사용 |
| `fnl` 쿠키 | leadId | 유지 (leadId → campaign 조회) |
| `getActiveOffer` | 전역 활성 상품 1개 | `campaign_products` 조회 |
| VOD deadline/src | env/전역 | campaign 설정 |
| booking embed | env | campaign 설정 |
| 카운트다운 | root props | campaign 설정 주입 |
| 리마인더 크론 | 전역 템플릿 | `lead.campaign_id` → `campaign_messages` ?? 전역 |
| 래피드 웹훅 | 전역 상품 매칭 | lead → campaign → 상품/문구/리다이렉트 |
| 대시보드 | 전역 집계 | 캠페인 선택기 + 전체 롤업 |
| CRM 목록/상세 | 전역 | 캠페인 컬럼 + 필터 |
| 퍼널 흐름도 | 고정 slug | 캠페인별 |
| 빌더 라우트 | `/admin/builder/[slug]` | `/admin/builder/[campaignId]/[pageType]` |
| `/api/funnel/[slug]` (save/link) | slug | campaignId + pageType |
| `/admin/settings` | 전역 | 전역(연동 키) + 캠페인별(픽셀/영상/캘린더) 분리 |
| `/preview` | 고정 | 캠페인 선택 |
| middleware | /admin 보호 | + 예약어 slug 가드 |
| `flow.ts` / `defaults.ts` | slug 상수 | page_type 상수로 (캠페인 무관) |

---

## 5. 추적 (Meta Pixel + GA4 / Google Ads)

**주입**: `<CampaignTracking pixelId ga4Id googleAds />` 클라 컴포넌트를 `(funnel)/[campaign]/layout.tsx` 에서 캠페인 설정으로 렌더. 스크립트는 Next `<Script>` (afterInteractive).

**이벤트 발화 지점**

| 시점 | Meta | GA4 | Google Ads |
|---|---|---|---|
| 랜딩 진입 | PageView | page_view | — |
| LeadForm 제출 성공 | `Lead` | `generate_lead` | lead conversion |
| 땡큐 결제버튼 클릭 | `InitiateCheckout` | `begin_checkout` | — |
| `?paid=1` 리다이렉트 감지 | `Purchase` (value=상품가, currency=KRW) | `purchase` | purchase conversion |
| 예약 완료 | `Schedule` | `generate_lead`(예약) | booking conversion |

- 결제 추적은 **웹훅 없이** `?paid=1` 리다이렉트 방식 (별도 문서 참고). 래피드 "결제 후 이동" = `/{slug}/vod?paid=1`.
- UTM: 광고 링크 `?utm_source=&utm_medium=&utm_campaign={slug}` → lead 저장(이미 구현) + 픽셀 이벤트 파라미터.
- **서버측 전환 API(Meta CAPI / GA4 MP)** 는 P4 — iOS/애드블록 유실 보정. 우선 클라 픽셀만.

---

## 6. 템플릿 / 복제 ("계속 늘어남" 대응)

- **새 캠페인** = 템플릿 or 기존 캠페인 선택 → `campaign_pages` 4개 + 설정 복제 → slug/name 지정 → draft.
- 복제 규칙: page data 안 이미지 URL 은 그대로 공유(재업로드 X). 문구·영상·상품·픽셀은 새로 입력하도록 유도(설정 화면에 "미설정" 배지).
- 기본 템플릿 1개 시딩(현재 defaults 를 템플릿 캠페인으로).

**관리자 IA**

```
/admin
  /campaigns              캠페인 목록 (상태·미니지표·복제·보관)
  /campaigns/new          템플릿 선택 → 생성
  /campaigns/[id]         캠페인 허브 (이 캠페인 지표 + 바로가기)
    /settings             영상·상품매핑·캘린더·픽셀·카운트다운·UTM·리다이렉트
    /pages                4개 페이지 → 빌더 링크 + 발행상태
    /flow                 이 캠페인 흐름도
    /messages             이 캠페인 문자 오버라이드
  /builder/[id]/[type]    빌더 (풀스크린)
  /crm?campaign=          전역 CRM + 캠페인 필터
  /orders?campaign=
  /products               상품 전역 풀 (캠페인에서 매핑)
  /automation             전역 기본 트리거
  /settings               전역 연동 키 (DB·래피드·솔라피)
```

---

## 7. 마이그레이션 (무중단)

1. `campaigns` 테이블 생성. 현재 콘텐츠를 캠페인 1개로 이관(`slug` = 실제 캠페인명 또는 `main`), `is_default = true`.
2. `funnel_pages` → `campaign_pages` 복사 (campaign_id 채움). 구 테이블은 한동안 유지.
3. `leads.campaign_id` 추가 → 전 리드 기본 캠페인 backfill → not null.
4. `(funnel)/[campaign]` 라우트 추가. `/` → 기본 캠페인 rewrite. 외부 URL 불변.
5. `/thankyou` `/vod` `/booking` → `/{default}/…` rewrite (하위호환) 후 단계적 제거.
6. env 설정(`NEXT_PUBLIC_VOD_SRC`, `NEXT_PUBLIC_WHATTIME_EMBED_URL`, `VOD_ACCESS_WINDOW_HOURS`) → 기본 캠페인 설정으로 복사. env 는 신규 캠페인 기본값 fallback 으로만.

---

## 8. 단계별 실행

| Phase | 범위 | 완료 기준 |
|---|---|---|
| **P1 뼈대** | campaigns 모델 + `[campaign]` 라우팅 + 마이그레이션 + `getFunnelData`/`FunnelPage`/`/api/leads`/`getActiveOffer`/빌더 재배선. 관리자는 최소(캠페인 목록 + 기존 빌더 연결). | `/` 그대로 동작 + 2번째 캠페인을 URL 로 추가 가능 |
| **P2 관리자 IA** | 캠페인 허브·설정·복제·템플릿, CRM/주문/대시보드 캠페인 필터, 흐름도 캠페인화 | 관리자가 캠페인을 처음부터 만들고 발행 가능 |
| **P3 캠페인별 설정 심화** | 영상·캘린더·상품매핑·카운트다운·문자 오버라이드, 리마인더 크론 + 웹훅 캠페인 인지 | 캠페인마다 완전히 다른 오퍼 운영 |
| **P4 추적** | Meta Pixel + GA4 주입, 이벤트 발화, UTM 표준화, (선택) CAPI | 광고 대시보드에서 캠페인별 Lead/Purchase 전환 확인 |

---

## 9. 열린 질문

1. `/` 를 대표 캠페인으로? (마케팅상 추천) 아니면 관리자 로그인으로?
2. 상품: 캠페인 전용 vs **공유 풀 + 매핑**(추천 — 같은 워크북 재사용). → 공유 풀로 가정.
3. 되는시간: 캠페인마다 계정이 다른가, 같은 계정 다른 이벤트타입인가.
4. 리드 dedup: 같은 사람이 캠페인 A·B 둘 다 신청 → 별도 리드 vs 통합 컨택트. (현재는 캠페인별 별도 리드로 가정)
5. A/B: 같은 캠페인 안에서 랜딩 2버전 트래픽 분배까지 갈지 → **P2 이후 별도**.
6. 관리자 인증(Clerk)을 이 작업 전에 넣을지 후에 넣을지. (멀티 캠페인이면 더 시급)
7. 캠페인 slug 명명 규칙 / 예약어 목록 확정.

---

## 10. 이번 작업이 건드리지 않는 것

- 결제 서명 검증 로직(`latpeed.ts`) — 캠페인 무관 유지
- 이미지 업로드(Blob) — 전역 유지
- 자동화 트리거 **전역 기본값** — 유지, 캠페인이 override
- 사용자 퍼널 **디자인/블록**(`config.tsx` render, 다크 테마) — page_type 만 캠페인 컨텍스트로 받음
