# VOD 퍼널 — 외주 개발자 인수인계 문서

> 작성일 2026-09-04 · 브랜치 `fix/crm-payment-link` (조사 시점 기준 `main`과 동일 커밋 `6ce6931`, 커밋되지 않은 diff 없음)
> 코드베이스 전수조사(스키마·라우트·lib·docs) 기반으로 작성. 확인이 필요한 항목은 "⚠️ 코드에서 확인 필요"로 표시했으니 실제 반영 전 반드시 재검증할 것.

## 목차

- [A. 전체 아키텍처 개요](#a-전체-아키텍처-개요)
- [B. 데이터 모델 전체 (`src/db/schema.ts`)](#b-데이터-모델-전체-srcdbschemats)
- [C. 사용자 퍼널 전체 흐름](#c-사용자-퍼널-전체-흐름)
- [D. 캠페인/멀티테넌트 구조](#d-캠페인멀티테넌트-구조)
- [E. 결제 흐름 (토스페이먼츠) 상세](#e-결제-흐름-토스페이먼츠-상세)
- [F. 메시징/자동화 시스템 상세](#f-메시징자동화-시스템-상세)
- [G. 광고 추적/귀속](#g-광고-추적귀속)
- [H. 제휴(affiliates) 시스템](#h-제휴affiliates-시스템)
- [I. 쿠폰(coupons) 시스템](#i-쿠폰coupons-시스템)
- [J. 방송(broadcasts)/라이브(events)](#j-방송broadcasts라이브events)
- [K. 인증 체계](#k-인증-체계)
- [L. 관리자 화면 전체 목록](#l-관리자-화면-전체-목록)
- [M. 크론잡 전체 목록](#m-크론잡-전체-목록)
- [N. 환경변수 전체 목록](#n-환경변수-전체-목록)
- [O. 로컬 개발 시작 가이드](#o-로컬-개발-시작-가이드)
- [P. 배포(Vercel) 관련 특이사항](#p-배포vercel-관련-특이사항)
- [Q. 현재 진행 중인 작업 / 미완성 부분](#q-현재-진행-중인-작업--미완성-부분)
- [R. 알려진 주의사항 / 트랩](#r-알려진-주의사항--트랩)

---

## A. 전체 아키텍처 개요

**스택**: Next.js 16.3.3(App Router) + React 19.2.8 + TypeScript + Drizzle ORM + Postgres(Neon) + Puck(`@puckeditor/core`) 페이지빌더 + Clerk(관리자 인증) + 토스페이먼츠(`@tosspayments/tosspayments-sdk`) + 솔라피(`solapi`, SMS/카카오 알림톡) + Vercel Blob(이미지 업로드) + `@xyflow/react`(퍼널 흐름도) + Remotion(영상 렌더링, 용도는 ⚠️ 코드에서 확인 필요).

**핵심 개념**: "캠페인(campaign)" = 웨비나 오퍼 한 벌(광고→랜딩→땡큐→VOD→예약 등 페이지 세트 + 설정 + 상품매핑 + 자동 메시지 오버라이드). 하나의 코드베이스가 여러 캠페인(멀티테넌트에 가까운 멀티퍼널)을 `slug`로 구분해 서빙한다. 기본 캠페인(`is_default=true`)은 `/`로, 나머지는 `/{slug}/...`로 서빙.

**디렉터리 구조**
- `src/app/[campaign]/...` — 사용자 퍼널(캠페인별 동적 라우트: landing/thankyou/vod/booking/community/sales/course/download)
- `src/app/(무접두 미러 라우트)` — `/`, `/thankyou`, `/vod`, `/booking`, `/community`, `/sales`, `/course`, `/download` 등(기본 캠페인용, `src/app/[campaign]/_resolve.ts`의 `resolveOr404()`가 기본 캠페인이면 무접두 경로로 리다이렉트)
- `src/app/admin/(dash)/...` — 관리자 대시보드(사이드바 레이아웃, 라우트그룹)
- `src/app/admin/builder/[campaignId]/[pageType]` — Puck 풀스크린 빌더((dash) 밖, 사이드바 없음)
- `src/app/api/...` — 공개 API(리드/결제/웹훅/크론) + 보호 API(캠페인/CRM/업로드)
- `src/db/schema.ts` — 전체 스키마(약 1189줄)
- `src/lib/` — 서버 전용 비즈니스 로직
- `src/components/funnel-views.tsx`(약 898줄) — 사용자 퍼널 실제 렌더 뷰(LandingView/ThankYouView/VodView/BookingView/GroupChatView/SalesView/DeliveryView/CourseView)
- `src/puck/` — Puck 블록 정의(`config.tsx`) + 기본 페이지 데이터(`defaults.ts`)
- `docs/` — 설계 문서 8개(대부분 "검토 대기" 상태 — 실제 구현과 어긋날 수 있음, Q/R 참조): `multi-campaign-plan.md`, `messaging-unification-plan.md`, `toss-payments-plan.md`, `multi-product-funnel-plan.md`, `admin-ia-plan.md`, `funnel-templates-plan.md`, `kakao-alimtalk-handoff.md` 등

**미들웨어**(`src/middleware.ts`): Clerk 인증 보호(`/admin`, `/api/campaigns`, `/api/crm`, `/api/broadcasts`, `/api/upload`, `/preview`) + 랜딩 A/B variant 쿠키(`abv`) 지정 + 광고 첫 유입 쿠키(`_fbc`, `_ft`, `_aff`) 심기.

**왜 이렇게 설계했는가(추정)**
- 멀티캠페인 구조는 여러 광고 오퍼(웨비나 주제별)를 동시에 운영하면서 랜딩페이지·자동메시지·상품매핑을 독립적으로 실험하기 위함(`docs/multi-campaign-plan.md`).
- 자동 메시지를 "트리거+지연+대상조건+본문"의 범용 스텝 모델로 통합한 것은, 과거 고정 트리거(`automation_triggers`) 방식이 캠페인마다 문구만 다르고 로직은 하드코딩이라 확장성이 없었기 때문(`docs/messaging-unification-plan.md`).
- 래피드(Latpeed) → 토스페이먼츠 전환은 자체 결제 통제(오더범프/쿠폰/구독)를 위한 것으로 추정(`docs/toss-payments-plan.md`).

---

## B. 데이터 모델 전체 (`src/db/schema.ts`)

### Enum
- `lead_status`: `applied` → `watching` → `watched` → `purchased` → `booked` → `consulted`, 이탈(`expired`/`no_purchase`), 구독 `member`
- `message_trigger`(구 시스템, deprecated): `signup_confirm`, `reminder_24h`/`12h_left`/`1h_left`, `pre_payment_nudge`, `payment_success`, `payment_cancel_admin`, `membership_offer`/`trial_ending`/`renewed`/`payment_failed`/`canceled`
- `message_status`: `pending`/`sent`/`failed`
- `order_status`: `success`/`cancel`/`webhook_missing`/`pending`
- `page_type`: `landing`, `thankyou`, `vod`, `booking`, `groupchat`, `sales`, `delivery`, `membership`
- `campaign_status`: `draft`/`live`/`archived`
- `message_automation_trigger`(신 시스템): `signup`, `watch_start`, `purchase`, `booking`, `manual`, `cart_abandon`, `event_registered`
- `message_audience`: `all`, `not_watched`, `not_purchased`, `not_booked`

### 캠페인/멀티테넌트
- **`campaigns`**: `id`, `slug`(unique), `name`, `status`, `is_default`, `is_template`, `template_key`, `ab_landing`, `funnel_type`(기본 `evergreen_webinar`), `terminal_step`(기본 `booking`), `group_chat_url`, `flow`(jsonb), `vod_src`, `vod_window_hours`(기본 48), `booking_embed_url`, `download_url`, `checkout_redirect_url`, `countdown_mode`/`countdown_deadline`/`countdown_rush_seconds`, `meta_pixel_id`, `ga4_measurement_id`, `meta_ad_account_id`, `meta_ad_campaign_ids`(jsonb), `google_ads`(jsonb), `default_utm_campaign`, `created_at`/`updated_at`
- **`campaign_slug_redirects`**: `old_slug`(pk) → `campaign_id` (slug 변경 시 301 보호)
- **`campaign_pages`**: `campaign_id` + `page_type` + `variant`('a'|'b') + `version` + `published` + `data`(jsonb, Puck), unique(`campaign_id`,`page_type`,`variant`,`version`)
- **`campaign_products`**: `campaign_id` + `product_id`(복합 unique) + `placement`('thankyou'|'vod_bottom'|'both'|'sales') + `sort_order` + `bump_product_id`/`bump_description`/`upsell_product_id`/`downsell_product_id`(캠페인 오버라이드, `products` 동일 컬럼보다 우선)
- **`campaign_messages`**(deprecated): `campaign_id`+`trigger` unique, `enabled`/`template`/`offset_hours`

### 리드/사용자
- **`leads`**: `campaign_id`, `landing_variant`, `name`, `email`(notNull), `phone`(notNull), `status`, `consent_at`, `utm`(jsonb), `fbc`/`fbp`/`fbclid`, `client_ip`/`client_ua`, `landing_url`/`referrer`, `first_watched_at`, `user_id`, `vod_expires_at`(notNull, insert시 +48h), `created_at`/`updated_at`. 인덱스: `email`/`phone`/`status`/`campaign_id`
- **`users`**: `phone`(unique), `name`, `created_at`, `last_login_at` — 휴대폰 OTP 로그인 엔드유저 계정
- **`user_sessions`**: `token`(pk), `user_id`, `expires_at`
- **`phone_otps`**: `phone`, `code_hash`(sha256), `expires_at`, `attempts` — 발송기록(원문 코드 미저장, 해시만)

### 제휴/브로드캐스트
- **`affiliates`**: `name`, `phone`, `email`, `code`(unique), `commission_pct`(기본 20), `status`(`active`/`paused`), `payout_info`
- **`affiliate_referrals`**: `affiliate_id` + `lead_id`(unique) + `first_seen_at`(리드당 1개, first-touch)
- **`broadcasts`**: `name`, `body`, `segment`(jsonb), `scheduled_at`(null=즉시), `status`(`draft`/`scheduled`/`sending`/`sent`), `sent_count`/`failed_count`/`sent_at`
- **`broadcast_sends`**: `broadcast_id`+`lead_id`(unique), `status`, `error`, `sent_at`

### 상품/주문/엔타이틀먼트
- **`products`**: `name`, `description`, `image_url`, `price`, `compare_at_price`, `active`, `show_from`/`show_until`, `latpeed_product_id`/`latpeed_checkout_url`(**deprecated**), `placement`, `payment_provider`(**deprecated**, 항상 'toss'), `kind`('one_time'|'membership'), `type`('workbook'|'vod_course'|'ebook'|'coaching'|'membership'), `delivery`(jsonb), `access_days`, `price_mode`('paid'|'free'|'pwyw'), `toss_order_name`, `membership_free_months`, `bump_product_id`/`bump_description`(전역, `campaign_products` 오버라이드 우선), `upsell_product_id`/`downsell_product_id`(전역), `bundle_product_ids`(jsonb), `next_offer_id`
- **`orders`**: `campaign_id`, `lead_id`, `product_id`, `provider`('toss', 과거 'latpeed'), `latpeed_order_id`(deprecated), `toss_payment_key`, `subscription_id`, `order_role`('main'|'upsell'|'downsell'|'subscription'), `bump_product_id`/`bump_amount`, `coupon_id`/`discount`, `affiliate_id`/`commission`/`commission_paid`, `email`, `phone`, `amount`, `status`, `method`, `paid_at`. unique: `latpeed_order_id`, `toss_payment_key`(NULLS DISTINCT)
- **`entitlements`**: `lead_id`+`product_id`(unique) — "이 리드가 이 상품에 접근권한 있음" 원장. `user_id`(향후), `source_order_id`, `kind`('course'|'ebook'|'coaching'|'membership'), `status`('active'|'revoked'|'expired'), `granted_at`, `expires_at`(`access_days`로 계산, null=평생), `meta`(jsonb)
- **`pending_orders`**: `order_id`(pk, `toss_<uuid>`) — 승인 전 주문 컨텍스트(위변조 방지), `campaign_id`/`lead_id`/`product_id`, `amount`, `bump_product_id`/`bump_amount`, `role`, `coupon_id`/`discount`, `status`('ready'|'done'|'fail')
- **`subscriptions`**: `campaign_id`, `lead_id`, `product_id`, `billing_key`, `customer_key`(=`lead_id`), `card_info`(마스킹), `status`('active'|'past_due'|'canceled'), `interval`('monthly'), `amount`, `current_period_end`, `trial_ends_at`, `canceled_at`, `retry_count`
- **`billing_keys`**: `lead_id`(unique) — 저장된 카드(원클릭 업셀용), `customer_key`, `billing_key`, `card_info`

### 강의/이벤트
- **`courses`**: `product_id`(unique, 1:1), `title`, `description`, `updated_at`
- **`course_modules`**: `course_id`, `sort_order`, `title`
- **`course_lessons`**: `module_id`, `sort_order`, `title`, `video_provider`('youtube' 고정), `video_ref`, `duration_sec`, `is_preview`, `drip_days`
- **`lesson_progress`**: `lead_id`+`lesson_id`(unique), `completed_at`
- **`events`**: `campaign_id`, `starts_at`, `timezone`(기본 `Asia/Seoul`), `duration_min`, `external_live_url`, `replay_url`, `replay_window_hours`(기본 48), `status`('scheduled'|'ended'|'canceled') — 라이브 웨비나 회차(방송 자체는 앱 밖, 유튜브 라이브 등에서 진행)
- **`event_registrations`**: `event_id`+`lead_id`(unique), `registered_at`, `reminded_d1`/`reminded_h1`, `token`(unique, `/live/{token}` 클릭=참석 기록), `notified_at`, `attended_at`, `rsvp_at`
- **`event_notices`**: `event_id`, `kind`('notice'|'rsvp'), `memo`, `body`, `live_url`, `sent_count`/`failed_count`, `dry_run`

### 쿠폰
- **`coupons`**: `code`(unique), `name`, `type`('percent'|'fixed'), `value`, `active`, `starts_at`/`ends_at`, `max_redemptions`, `redeemed_count`, `min_amount`, `lead_window_hours`(개인별 데드라인 퍼널), `product_ids`(jsonb)
- **`coupon_redemptions`**: `coupon_id`, `lead_id`, `order_id`, `discount`, `redeemed_at`

### 광고/웹훅 로그
- **`webhook_events`**: `provider`(기본 'latpeed', 실제로는 'whattime'/'meta_capi' 등도 사용), `type`, `status`, `signature_valid`, `payload`(jsonb), `processed_at`, `error`
- **`ad_daily_stats`**: `campaign_id`+`date`+`source`(unique) — Meta 광고 일자별 지표(`impressions`/`clicks`/`spend`/`reach`/`raw`)

### 메시징(자동 메시지, 신엔진)
- **`message_automations`**: `campaign_id`(null=전역기본), `key`(null=사용자생성|'signup_confirm' 등 시스템기본), `name`, `trigger`, `enabled`, `stop_on`(jsonb)
- **`message_automation_steps`**: `automation_id`, `step_order`, `delay_minutes`, `audience`, `body`, `channel`('sms'|'alimtalk'), `kakao_template_id`, `kakao_variable_map`(jsonb), `enabled`
- **`message_automation_enrollments`**: `automation_id`+`lead_id`(unique), `anchor_at`, `status`('active'|'done'|'stopped')
- **`message_sends`**: `lead_id`+`step_id`(unique) — 발송 기록(구 `message_logs` 대체)
- **`kakao_templates`**: `solapi_template_id`(unique), `channel_id`, `name`, `content`, `header`, `status`('PENDING'|'INSPECTING'|'APPROVED'|'REJECTED'), `variables`(jsonb), `buttons`(jsonb), `synced_at`

### Deprecated (구 시스템, 마이그레이션 소스로만 유지 — drop 금지)
- **`automation_triggers`**, **`message_logs`**, **`funnel_pages`**, **`campaign_messages`**

---

## C. 사용자 퍼널 전체 흐름

기본 흐름: `landing → thankyou → vod(48h) → {terminal}`. `campaigns.terminal_step`이 종착을 결정:

| terminal_step | 라우트 | 뷰 | 설명 |
|---|---|---|---|
| `groupchat` | `/{slug}/community` | `GroupChatView` | 무료 단톡방 입장 안내, 게이트 없음 |
| `booking` | `/{slug}/booking` | `BookingView` | 되는시간(WhatTime) 임베드 1:1 예약(기본값) |
| `sales` | `/{slug}/sales` | `SalesView` | 유료 상품 세일즈레터 |

추가 페이지 타입(멀티상품 퍼널 확장):
- `sales`(`/{slug}/sales`) — CTA `{{checkout}}`을 `funnel-offer.ts`의 `resolveCheckoutUrl`이 실제 결제 URL로 치환
- `delivery`(`/{slug}/download`) → `DeliveryView` — 전자책/자료 다운로드. 무료상품(`price_mode='free'`)은 `GET /api/claim`으로 즉시 엔타이틀먼트 부여
- `course`(`/{slug}/course`) → `CourseView` — 강의실(모듈/레슨 트리 + 유튜브 임베드 + 진도)
- `membership`(enum에 존재) — 라우트/뷰 ⚠️ 코드에서 확인 필요

**라우팅 이중화**: `src/app/[campaign]/...`(캠페인별 동적) + 무접두 미러 라우트 두 세트 병존. `_resolve.ts`의 `resolveOr404()`가 기본 캠페인이면 무접두로 redirect.

**funnelType별 시퀀스**(`campaigns.funnel_type`, 구현 범위 개별 확인 필요):
- `evergreen_webinar`(기본): landing→thankyou→vod(48h)→terminal
- `live_webinar_reg`: landing→thankyou(일정·외부링크)→vod(리플레이 자동전환, `events` 사용)→terminal
- `vod_course`/`ebook`/`paid_consult`: sales→checkout→(upsell→downsell)→thankyou→course/delivery/booking

**A/B 랜딩**: `campaigns.ab_landing=true`면 middleware가 `abv` 쿠키(50:50, 30일)를 지정, `campaign_pages.variant`로 다른 발행본 서빙. `leads.landing_variant`에 기록. 시작/종료는 `src/app/admin/(dash)/campaigns/actions.ts`의 `startAbTest`/`endAbTest`.

---

## D. 캠페인/멀티테넌트 구조

`src/lib/campaign.ts` 핵심 함수:
- `getDefaultCampaign()` — `is_default=true` 조회
- `resolveCampaignSlug(slug)` — slug 조회, 없으면 `campaign_slug_redirects`도 확인
- `listCampaigns()` — 관리자 목록용
- `getCampaignById(id)`
- `getCampaignPageData(campaignId, pageType, variant)` — 미발행 시 `defaults.ts` 폴백, variant 'b' 없으면 'a' 폴백
- `getAbLandingState()` — 30초 TTL 인메모리 캐시(다중 인스턴스 환경 주의, R 참조)
- `campaignBasePath(c)` — 기본 캠페인은 `""`, 아니면 `/{slug}`
- `checkoutRedirect(c)` — 결제 후 리다이렉트 URL 계산

**예약어 slug**: `admin`, `api`, `preview`, `thankyou`, `vod`, `booking`, `community`, `sales`, `download`, `course`, `login`, `library`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`

**상품 매핑**: 상품은 전역 풀(`products`), 캠페인이 `campaign_products`로 노출위치(`placement`)와 함께 매핑. `getActiveOffer(campaignId, placement)`(`src/lib/funnel-offer.ts`)가 활성 상품 1개 조회. `getProductOffers(productId, campaignId)`가 범프/업셀/다운셀 해석(캠페인 오버라이드 우선, 전역 폴백).

**관리자 IA**: `/admin/campaigns`(목록), `/admin/campaigns/[id]`(허브), `/admin/campaigns/[id]/settings`(영상·캘린더·카운트다운·픽셀·상품매핑), `/admin/campaigns/new`(템플릿/복제 생성). 빌더 `/admin/builder/[campaignId]/[pageType]`. API `/api/campaigns/[id]/pages/[type]`.

---

## E. 결제 흐름 (토스페이먼츠) 상세

래피드(Latpeed) 결제는 제거됨. 관련 컬럼(`latpeed_*`)은 과거 데이터 호환용 deprecated. `src/app/api/latpeed/webhook` 폴더도 아직 존재 — ⚠️ 실제 사용 여부 코드 확인 필요.

### 엔드포인트별 흐름

1. **`POST /api/toss/prepare`**: 결제 직전 서버가 금액을 계산(본상품+오더범프-쿠폰할인)해 `pending_orders`에 저장, `order_id`(`toss_<uuid>`)와 `amount` 반환. 클라이언트 값은 신뢰 대상 아님. 쿠폰은 `role='main'`에만 적용.
2. **`/checkout?p=&l=`**: 토스 결제위젯(V2) 렌더 → `requestPayment()` → 성공 시 `successUrl`(=`/api/toss/confirm`)로 리다이렉트(`paymentKey`,`orderId`,`amount`).
3. **`GET /api/toss/confirm`** 처리 순서:
   - (a) `pending_orders` 저장 금액 대조(불일치 시 `AMOUNT_MISMATCH` fail)
   - (b) 기존 `orders.toss_payment_key` 조회로 멱등 처리
   - (c) `confirmTossPayment()`(`src/lib/toss.ts`) 승인 API 호출, `status!=='DONE'`이면 실패
   - (d) `orders` insert(`onConflictDoNothing` on `toss_payment_key` unique)
   - (e) 쿠폰 사용확정(`redeemCoupon`)
   - (f) 어필리에이트 커미션 기록(`recordCommission`)
   - (g) `pending_orders.status='done'`
   - (h) `role==='main'`이면 `leads.status='purchased'`
   - (i) `grantEntitlement()`(본상품+범프)
   - (j) Meta CApI Purchase(`event_id=purchase.lead.<leadId>`, 그 외 role은 `purchase.<role>.<paymentKey>`)
   - (k) `role==='main'`이면 `enrollLead(leadId,'purchase',campaignId)` + `stopAutomations(leadId,'purchase')`
   - (l) 리다이렉트: main+업셀 설정 시 `/checkout/upsell`, 아니면 캠페인 `checkout_redirect_url` 또는 `{basePath}/vod?paid=1`
4. **`GET /api/toss/billing-confirm`**: 멤버십 빌링키 발급 콜백. `issueBillingKey()` → `startSubscription()`(`src/lib/billing.ts`, 무료개월 반영) → `leads.status='member'` → `enrollLead('purchase')` → 결제후 URL 리다이렉트.
5. **`GET /api/cron/billing`** / `runDueBilling()`: 도래한 구독 청구. 성공 시 `current_period_end`+1개월, 실패 시 `retry_count`++, 3회 초과 시 `past_due`.
6. **`POST /api/coupon/validate`**: 체크아웃 프리뷰용(실제 확정은 prepare/confirm에서 서버 재검증).
7. **`GET /api/claim`**: 무료상품(`price_mode='free'`) 즉시 엔타이틀먼트 부여 → `/download`.

**환경변수**: `NEXT_PUBLIC_TOSS_CLIENT_KEY`(브라우저), `TOSS_SECRET_KEY`(서버). 가상계좌/계좌이체는 P1 미지원.

---

## F. 메시징/자동화 시스템 상세

**통합 엔진**(`src/lib/messaging.ts`): 모든 CRM 문자 = `{시작 이벤트(trigger)} + {N분 뒤(delay_minutes)} + {대상 조건(audience)} + {본문}`.

- `enrollLead(leadId, trigger, campaignId)` — 해당 트리거 automation들 조회(`resolveAutomations`) 후 enrollment 생성, `delay_minutes===0` 스텝은 즉시 발송
- `resolveAutomations(campaignId, trigger?)` — 전역기본(`campaign_id=null`) + 캠페인 전용, 같은 `key`면 캠페인 전용이 우선. 사용자 생성(`key=null`) 자동화는 해당 캠페인 것만 포함
- `runDueAutomationSteps()` — 크론이 호출, 지연 도래한 스텝 발송(`audienceMatches`로 재확인)
- `stopAutomations(leadId, event)` — 이 이벤트가 `stop_on`에 포함된 enrollment를 `stopped`로
- `buildMessageVars(campaignId, leadId, productName?)` — 템플릿 변수: `{이름}` `{링크}` `{예약링크}` `{결제링크}` `{단톡방링크}` `{세일즈링크}` `{강의실링크}` `{다운로드링크}`(=`campaigns.download_url`, 없으면 시청링크) `{라이브링크}` `{라이브일시}` `{라이브러리링크}` `{상품명}` `{마감시각}`
- 채널: `sms`(기본) | `alimtalk`(카카오, 실패 시 body로 SMS 자동 대체발송)

**카카오 알림톡**(`src/lib/kakao.ts`, `src/lib/solapi.ts`): 코드는 완성. 실사용을 위해 (1) 카카오 비즈니스 채널 개설, (2) `SOLAPI_KAKAO_CHANNEL_ID` 설정, (3) 솔라피 콘솔 템플릿 등록·승인(영업일 1~2일) 필요. `/admin/settings/kakao`에서 채널상태/템플릿/동기화. 미승인 상태에선 SMS로 폴백.

**야간 발송 제한**: `src/lib/solapi.ts`의 `scheduledSendTime()`가 KST 기준 `SMS_QUIET_START`(기본0)~`SMS_QUIET_END`(기본8)에 걸리면 다음 아침 08:00 KST 예약발송(`scheduledDate`). `signup_confirm`과 OTP만 `immediate:true`로 야간에도 즉시.

**트리거 발생 지점**
- `signup`: `POST /api/leads`의 `after()` 훅
- `watch_start`: `first_watched_at` 세팅 시점(`funnel-views.tsx` 내부, ⚠️ 정확한 훅 위치 확인 필요)
- `purchase`: `/api/toss/confirm`, `/api/toss/billing-confirm`
- `booking`: `/api/whattime/webhook`(`schedule_created`)
- `cart_abandon`: `enrollAbandonedCarts()`(`src/lib/cart.ts`, 크론에서 호출)
- `event_registered`: `registerForEvent`(`src/lib/events.ts`)
- `manual`: 관리자 CRM 등록 또는 billing dunning 안내

**크론 진입점**: `GET /api/cron/reminders` → `enrollAbandonedCarts()` → `runDueAutomationSteps()` → `sendEventPreReminders()` → `runDueBilling()` → `runDueBroadcasts()` 순서. `Authorization: Bearer CRON_SECRET` 필요.

**브로드캐스트**(`src/lib/broadcasts.ts`): 세그먼트(`resolveSegment()`)에 1회성 발송. `runBroadcast()`가 `broadcast_sends` unique로 중복방지. 예약발송은 `runDueBroadcasts()`.

---

## G. 광고 추적/귀속

**클릭 식별자(미들웨어)**: `applyFirstTouch()`가 광고 진입 시 90일 쿠키:
- `_fbc`: `fb.1.<ts>.<fbclid>`(fbclid 있고 쿠키 없을 때만, first-touch 유지)
- `_aff`: `?ref=CODE` 어필리에이트 코드(`[a-zA-Z0-9_-]{2,32}`)
- `_ft`: utm_*, gclid, ttclid, fbclid, referrer(외부만), 진입경로, 타임스탬프 JSON(900자 제한)

**리드 저장**: `POST /api/leads`가 쿠키+헤더(IP/UA) 병합해 `leads.fbc/fbp/fbclid/client_ip/client_ua/landing_url/referrer` 저장. UTM은 last-click 우선.

**Meta CApI**(`src/lib/meta-capi.ts`): `sendMetaEvent()`, API v21.0. 이벤트: Lead(`lead.<id>`), Purchase(`purchase.lead.<leadId>` 또는 역할별), Schedule(`schedule.<code|leadId>`), InitiateCheckout. `event_id`로 브라우저 픽셀과 중복제거. `user_data`는 email/phone SHA-256 해시(phone은 0→82 변환 후 해시) + fbc/fbp/IP/UA + external_id. 픽셀ID는 캠페인 `meta_pixel_id` 우선, 없으면 `META_DEFAULT_PIXEL_ID`. 토큰은 `META_CAPI_TOKEN`(없으면 `META_ACCESS_TOKEN`). 로그는 `webhook_events(provider=meta_capi)`. `META_CAPI_TEST_CODE` 설정 시 테스트이벤트(실집계 안됨).

**광고 지표 수집**(`src/lib/meta-insights.ts`, `GET /api/cron/meta-insights`, 일 1회 01:00 UTC): Meta Marketing API insights를 `ad_daily_stats`로 upsert. 최근 7일 재수집(늦게 붙는 전환 반영). `?since=&until=` 백필. `campaigns.meta_ad_account_id`(없으면 `META_AD_ACCOUNT_ID`) + `meta_ad_campaign_ids`. 90일 지난 `raw` 자동 정리.

**광고 성과 리포트**: `/admin/analytics` — 광고비/노출/클릭/CTR/CPC + 리드/DB전환/DB단가 + SLO/본상품 주문·매출·상쇄율·ROAS 일자별. SLO 임계값 `META_SLO_MAX`(기본 300000). `?campaign=&from=&to=`.

**이벤트 발화 매핑**: 랜딩 진입=PageView, LeadForm 제출=Lead+`checkout_start`, `/vod?paid=1`=PaidTracker가 브라우저 픽셀 Purchase 발화(서버 CApI와 event_id로 중복제거), 예약 완료(whattime webhook)=Schedule.

---

## H. 제휴(affiliates) 시스템

- `src/lib/affiliates.ts`: `linkReferral(leadId, code)` — `_aff` 쿠키 코드로 `affiliate_referrals` 삽입(리드당 1개, first-touch). 정확한 호출 지점 ⚠️ 확인 필요(추정 `POST /api/leads`).
- `recordCommission({orderId, leadId, amount})`: 결제 성공 시(`/api/toss/confirm` (f)단계) 리드의 추천인을 찾아 `orders.affiliate_id`+`commission`(=amount×`commission_pct`%) 기록.
- 관리자 `/admin/affiliates`: 목록(추천수/주문수/매출/커미션/미지급), CRUD(`code`는 소문자 영숫자·`-_`, 2~32자), 활성/중지 토글, "지급완료" 일괄 처리(`markCommissionPaid`).
- 추천 링크 형식: `{origin}/?ref={code}`. 커미션 기본 20%.

---

## I. 쿠폰(coupons) 시스템

- `src/lib/coupons.ts`: `validateCoupon({code, productId, amount, leadId})` — 서버 전용 검증. 체크 항목: `active`, `starts_at`/`ends_at`, `lead_window_hours`(리드 신청시각+N시간 지나면 무효), `max_redemptions`, `product_ids`(빈배열=전체), `min_amount`, 리드당 1회 사용.
- `redeemCoupon()`: 결제 성공 후 사용 확정, `order_id` 중복 확인으로 재실행 안전.
- `POST /api/coupon/validate`: 체크아웃 프리뷰용. 실제 적용은 `POST /api/toss/prepare`가 재검증.
- 관리자 `/admin/coupons`: CRUD, percent(1~100)/fixed(원) 타입, 사용중/중지, 삭제.

---

## J. 방송(broadcasts)/라이브(events)

**두 가지 별개 개념 주의**:
1. **`broadcasts`** = 세그먼트에 1회성으로 쏘는 문자(자동 드립 아님). `/admin/broadcasts`에서 관리(세그먼트: 캠페인/시청여부/구매여부/상담예약여부/특정상품 구매·미구매/신청일 범위). 즉시 또는 예약(`scheduled_at`). `broadcast_sends` unique로 재발송 방지.
2. **`events`** = 날짜가 잡힌 라이브 회차(외부 유튜브 라이브 등에서 진행, 앱 자체는 방송하지 않음). `src/lib/events.ts`: `getUpcomingEvent(campaignId)`, `registerForEvent(leadId, campaignId)`(등록 시 `event_registered` 트리거). `event_registrations.token`으로 개인별 추적 링크(`/live/{token}`) — 클릭이 "참석"으로 기록(`attended_at`). 리마인더는 `sendEventPreReminders()`가 D-1/1시간전 발송(`reminded_d1`/`reminded_h1`로 중복방지, 자동화 엔진과 별도 로직). 수동 안내는 `event_notices`에 기록.

`src/app/live/[token]/page.tsx`가 클릭 추적 겸 라이브 진입 페이지로 추정 — ⚠️ 정확한 동작 확인 필요.

---

## K. 인증 체계

**1) 관리자 — Clerk**: `src/middleware.ts`가 `/admin`(`/admin/sign-in` 제외), `/api/campaigns`, `/api/crm`, `/api/broadcasts`, `/api/upload`, `/preview`를 `auth.protect()`로 보호. `src/app/admin/layout.tsx` = ClerkProvider + `ADMIN_EMAILS` 화이트리스트(⚠️ 정확한 검증 로직 확인 필요). 로그인 `/admin/sign-in`.

**2) 엔드유저 — 휴대폰 OTP**(`src/lib/auth.ts`): Clerk와 별개.
- `POST /api/auth/request` → `requestOtp(phone)`: 6자리 코드, sha256 해시 저장, 60초 재발송 쿨다운, 5분 TTL, 최대 5회 시도. 솔라피 즉시 발송.
- `POST /api/auth/verify` → `verifyOtp(phone, code)`: 성공 시 `users` upsert → 기존 `leads.user_id` 연결 → 세션(`user_sessions`, 60일) 발급 → httpOnly 쿠키 `usr`.
- `POST /api/auth/logout` → 세션 삭제 + 쿠키 제거.
- `getCurrentUser()`: `usr` 쿠키 → `user_sessions` join `users`(만료 체크).
- 용도: `/login`, `/library`(크로스 퍼널 보유 콘텐츠). 문서(`multi-product-funnel-plan.md`)는 "매직링크"라 적었으나 **실제 구현은 SMS OTP** — 문서·구현 불일치 주의.

---

## L. 관리자 화면 전체 목록

| 경로 | 역할 |
|---|---|
| `/admin` | 대시보드 |
| `/admin/campaigns`, `/admin/campaigns/[id]`, `/admin/campaigns/new` | 캠페인 목록/허브/생성(복제) |
| `/admin/campaigns/[id]/settings` | 영상·캘린더·카운트다운·픽셀·상품매핑 |
| `/admin/builder/[campaignId]/[pageType]` | Puck 풀스크린 빌더((dash) 밖) |
| `/admin/flow` | 퍼널 흐름도(`@xyflow/react`, 라이브 iframe + 이동 연결 편집, `PATCH /api/funnel/[slug]/link`) |
| `/admin/products`, `/[id]`, `/new` | 상품 전역 풀 CRUD(오더범프/업셀/다운셀/번들) |
| `/admin/coupons` | 쿠폰 CRUD |
| `/admin/affiliates` | 어필리에이트 CRUD + 커미션 정산 |
| `/admin/crm`, `/admin/crm/[id]` | 고객(리드) 목록/상세 |
| `/admin/automation`, `/[id]`, `/new` | 자동 메시지(전역기본+캠페인오버라이드), 채널선택 |
| `/admin/broadcasts` | 세그먼트 1회성 문자 발송 |
| `/admin/orders` | 결제/주문 목록 |
| `/admin/analytics` | 광고 성과 리포트 |
| `/admin/settings`, `/settings/setup`, `/settings/kakao` | 연동 설정(솔라피/토스/되는시간/env 체크리스트), 초기 설정 마법사, 카카오 알림톡 관리 |
| `/admin/journey` | 여정 지도(퍼널+문자 타임라인, 문자는 읽기전용→'자동 메시지'로 링크) |

`/preview`(프로덕션 비활성, `?preview=1`로 VOD 게이팅 우회) — 개발용 화면 오버뷰.

---

## M. 크론잡 전체 목록

| 라우트 | 하는 일 | 인증 |
|---|---|---|
| `GET /api/cron/reminders` | `enrollAbandonedCarts()` → `runDueAutomationSteps()`(자동 메시지 전체) → `sendEventPreReminders()`(라이브 D-1/1h) → `runDueBilling()`(멤버십 정기결제) → `runDueBroadcasts()`(예약 브로드캐스트). 외부 크론(cron-job.org) 15분 + Vercel 크론 일 1회 | `Authorization: Bearer CRON_SECRET` |
| `GET /api/cron/billing` | `runDueBilling()` 단독 | 동일 |
| `GET /api/cron/meta-insights` | Meta 광고 지표 동기화, 일 1회 01:00 UTC, `?since=&until=` 백필 | 동일 |

테스트: `npm run test:cron`(`SOLAPI_DRY_RUN=1`, dev 서버+`CRON_SECRET` 필요, `scripts/test-cron.ts`).

---

## N. 환경변수 전체 목록

**필수**
| 변수 | 용도 |
|---|---|
| `DATABASE_URL` | Neon Postgres 연결 |
| `CLERK_SECRET_KEY`(+ 프론트 공개키, ⚠️ 확인 필요) | 관리자 인증 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER` | 문자 발송(리마인더/OTP/알림톡) — 미연결 시 자동 문자 전무 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 이미지 업로드 |
| `CRON_SECRET` | 크론 라우트 보호 |
| `NEXT_PUBLIC_SITE_URL` | 절대 URL 생성 |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 토스 결제 |

**선택**
| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_VOD_SRC` | VOD 기본 영상(캠페인 설정이 우선) |
| `META_ACCESS_TOKEN` | Meta 시스템 사용자 토큰(광고지표+CApI 공용) |
| `META_AD_ACCOUNT_ID` | 기본 Meta 광고 계정(숫자, `act_` 접두 없음) |
| `META_CAPI_TOKEN` | CApI 전용 토큰(없으면 위 토큰) |
| `META_DEFAULT_PIXEL_ID` | 캠페인별 픽셀 미설정 시 폴백 |
| `META_CAPI_TEST_CODE` | CApI 테스트 이벤트(평시 비움) |
| `META_SLO_MAX` | SLO/본상품 구분 임계값(기본 300000) |
| `SMS_QUIET_START` / `SMS_QUIET_END` | 문자 야간 차단 시각(KST, 기본 0/8) |
| `SOLAPI_KAKAO_CHANNEL_ID` | 카카오 알림톡 채널ID — 미설정 시 SMS 대체 |
| `WHATTIME_WEBHOOK_SECRET` | 되는시간 웹훅 토큰 검증 |
| `VERCEL_ENV` / `VERCEL_PROJECT_PRODUCTION_URL` | 프리뷰 게이팅, 도메인 폴백(Vercel 자동 주입) |
| `NEXT_PUBLIC_BIZ_*`(NAME/OWNER/REG_NO/ADDR/TEL/EMAIL/MAIL_ORDER_NO) | 푸터 사업자정보 오버라이드(기본값 `src/lib/business.ts`) |

---

## O. 로컬 개발 시작 가이드

```bash
npm install
```

`.env.local`에 위 N 섹션 필수 값 설정 후:

```bash
npm run db:push
npm run seed
npm run migrate:campaigns
npm run dev
```

- `npm run db:studio` — Drizzle Studio로 DB 조회
- `npm run test:cron` — `SOLAPI_DRY_RUN=1`로 크론 로직 테스트(dev 서버 필요)
- 토스 결제는 테스트 키로 `/checkout` E2E 가능
- 문자 발송은 실배포 전 `SOLAPI_DRY_RUN` 플래그로 실발송 방지 가능
- `?preview=1`로 로컬 VOD 게이팅 우회(프로덕션은 `VERCEL_ENV==='production'`이면 무조건 차단)

---

## P. 배포(Vercel) 관련 특이사항

- Neon 연결 필요, Clerk/Mux/Sentry는 약관 수락 후 `vercel integration add`(Mux/Sentry는 P2/미구현으로 언급, ⚠️ 실제 사용 여부 확인 필요)
- `VERCEL_ENV`(≠`NODE_ENV`)로 production/preview 구분 — Vercel의 Preview/Production 빌드는 둘 다 `NODE_ENV=production`이라 `NODE_ENV`로는 구분 불가
- 외부 크론(cron-job.org)을 `/api/cron/reminders`에 15분 간격으로 걸어야 함(Vercel 자체 크론은 일 1회)
- 크론 라우트는 `CRON_SECRET` Bearer 토큰 보호 — Vercel Cron이 자동 주입하는지 ⚠️ 확인 필요
- 이미지: Vercel Blob(`webinar-funnel-media` 버킷)
- API 라우트 전반 `runtime="nodejs"` 명시(Edge 미사용)

---

## Q. 현재 진행 중인 작업 / 미완성 부분

**브랜치 상태**: `fix/crm-payment-link`가 `main`과 완전히 동일한 커밋(`6ce6931`)이며 diff 없음 — 아직 작업이 시작되지 않았거나 이미 머지되어 브랜치만 남은 상태로 보임. 실제 착수 여부 확인 필요.

**docs/의 "검토 대기" 기획들**:
- `admin-ia-plan.md`: 관리자 사이드바 재편 계획, **미실행**으로 보임(현재는 12개 이상 항목 평면 나열 추정)
- `funnel-templates-plan.md`: 퍼널 템플릿 8종 + 자동 CRM 세트, `src/lib/funnel-templates.ts` 존재하나 구현 범위(T1~T4) ⚠️ 확인 필요
- `messaging-unification-plan.md`: 스키마·`messaging.ts`·크론 배선은 완료로 보임. 구 테이블(`automation_triggers`/`campaign_messages`/`message_logs`)은 drop 안 되고 deprecated 유지 중
- `toss-payments-plan.md`: P1(일반결제) 완료, P2(구독/빌링) 스키마+코드 존재. **가상계좌/`/api/toss/webhook`은 미구현**
- `multi-product-funnel-plan.md`: P0'~P3 대부분 구현됨. **P4(라우팅 데이터화, 크로스셀/번들 확장)는 미착수로 보임**
- `kakao-alimtalk-handoff.md`: 코드 100% 완료, **채널 개설·`SOLAPI_KAKAO_CHANNEL_ID`·템플릿 승인 3가지 잔여**

`src/app/api/latpeed/webhook` 폴더가 아직 존재 — 죽은 코드인지 실제 호출 경로가 남아있는지 확인 필요.

---

## R. 알려진 주의사항 / 트랩

1. **래피드 잔재**: `products.latpeed_*`, `orders.latpeed_order_id`, `orders.provider` 기본값 `'toss'`지만 과거 데이터엔 `'latpeed'` 존재 가능 — provider 분기 누락 주의.
2. **`orders` unique는 NULLS DISTINCT**: `latpeed_order_id`/`toss_payment_key` 둘 다 nullable. `billing.ts`가 구독 회차결제 `orderId`를 `toss_payment_key`에 넣는 방식 — 실제 결제키가 아니라 주문ID라는 점 주의.
3. **자동 메시지 이중 시스템 공존**: 구 시스템(deprecated)과 신 시스템(`message_automations` 계열)이 스키마에 동시 존재. 신규 기능은 반드시 `src/lib/messaging.ts` 신 시스템만 사용.
4. **A/B 랜딩 캐시**: `getAbLandingState()` 30초 TTL 인메모리 캐시 — Vercel 다중 인스턴스 환경에서 설정 변경 반영이 인스턴스별로 최대 30초 지연될 수 있음.
5. **프리뷰 게이팅은 `VERCEL_ENV` 기준**, `NODE_ENV`로 판단하면 프로덕션에서도 `?preview=1`이 뚫림.
6. **쿠폰/오더범프 금액은 서버 재계산 필수**: `/checkout` 표시 금액은 참고용, `POST /api/toss/prepare`가 재계산해 저장 → `confirm`이 대조. 클라이언트 값을 신뢰하는 새 결제 경로를 만들면 위변조 취약점.
7. **엔타이틀먼트 번들은 1단계 재귀만 허용**(`_depth<1`) — 번들 안의 번들은 부여되지 않음(의도된 제약).
8. **멤버십 게이팅은 OR 조건**: `leads.vod_expires_at > now` **또는** `hasActiveSubscription`. VOD 로직 수정 시 한쪽만 고치면 다른 쪽이 깨질 수 있음(`VodView`, `funnel-views.tsx` 약 288번째 줄 부근).
9. **`event_registrations.token` 클릭=참석** 설계 — 문자 발송 실패나 링크 손상 시 참석률 집계가 왜곡됨.
10. **커미션/쿠폰 재실행 안전성**: 커미션은 명시적 중복가드가 약함(다만 `/api/toss/confirm`의 (b)단계 멱등가드가 앞서 있어 사실상 안전). 쿠폰은 `order_id` 유니크로 명시적 가드. 신규 결제 경로 추가 시 (b) 이전에 부수효과가 실행되지 않도록 순서 유지.
11. **deprecated 테이블(`funnel_pages`/`campaign_messages`/`automation_triggers`)을 실수로 drop하지 말 것** — 마이그레이션 스크립트 소스로 참조될 수 있음.
12. **Puck 빌더는 사이드바 밖 라우트그룹**(`(dash)` 밖) — admin 레이아웃 스타일 미적용은 의도된 설계(풀스크린 에디터).
