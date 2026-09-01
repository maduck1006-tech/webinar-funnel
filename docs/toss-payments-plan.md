# 토스페이먼츠 도입 기획

> 상태: 기획 + MCP-무관 골격 착수. **결제 동작은 아직 기존 래피드(Latpeed) 링크 방식 100% 유지** (toss 상품이 하나도 없어서 새 경로 미발화).
> 작성 기준: 코드베이스 현황 + TossPayments V2 일반 지식. `⚠️ MCP확인` = 토스 MCP 문서로 값/스펙 재확인 필요.
>
> **선작업 완료 (2026-09-01, 이 브랜치 미커밋):**
> - `src/db/schema.ts`: `leadStatus`+`member`, `messageTrigger`+멤버십 5종, `orderStatus`+`pending`, `pageType`+`membership`,
>   `products`에 `paymentProvider`/`kind`/`tossOrderName`/`membershipFreeMonths`, `orders`에 `provider`/`tossPaymentKey`/`subscriptionId`(+`latpeedOrderId` nullable),
>   신규 테이블 `pendingOrders`·`subscriptions`. → **`npm run db:push` 아직 안 함**
> - `src/lib/funnel-offer.ts`: `Offer`에 `provider`/`kind`, `resolveCheckoutUrl(offer,{basePath,leadId})` 헬퍼 (toss면 `/checkout?p=&l=` 생성, latpeed면 기존 그대로)
> - `src/components/funnel-views.tsx`: ThankYou/Vod 의 checkoutUrl 주입을 `resolveCheckoutUrl` 경유로 교체 (동작 동일)
> - `src/lib/flow-types.ts`, `src/lib/solapi.ts`: `membership` page_type + 멤버십 트리거 기본문구 (exhaustive switch 대응)
> - tsc/eslint 통과. 남은 pre-existing 에러 없음.
>
> **다음 세션 시작점:** 토스 MCP 로드 → §3/§11 의 `⚠️MCP확인` 대조 → `npm run db:push` → `src/lib/toss.ts` → `/checkout` → `/api/toss/confirm`

## 0. 로드맵

| 단계 | 내용 | 선행조건 |
|---|---|---|
| **P1** | 토스 일회성 결제 (카드+간편). 자체 `/checkout` + 서버승인 + 결제완료 문자. 래피드와 병행 | 토스 일반결제 계약(테스트키로 선개발 가능) |
| **P2** | 구독(빌링) — 고가상품 구매자 백엔드 오퍼. N개월 무료 후 유료전환. `/membership` Puck 페이지 + 크론 청구. 게이팅 OR 조건 | 정기결제 계약(P1 안정화 후) |
| **P3** | 멤버십 콘텐츠 라이브러리 (미니 LMS). `/members` + 강의 CRUD + Mux. → 별도 문서 분리 | Mux 확정 |
| 후속 | 가상계좌, 래피드 완전 제거, 부분취소 자동화, 사용자 셀프 해지 | |

## 1. 왜 바꾸나 / 목표

| 항목 | 기존 (래피드) | 토스 도입 후 |
|---|---|---|
| 결제 UX | 외부 결제페이지로 이탈 | 자체 도메인 `/checkout` 에 결제위젯 임베드 (이탈 없음) |
| 결제수단 | 래피드 제공분 | 카드·간편결제(토스페이·네이버페이 등)·가상계좌·계좌이체 |
| 승인/정산 | 래피드 계약 | 토스 계약 (수수료·정산주기 별도 확인) |
| 서버 신뢰 | 웹훅 서명 스펙 불명확(4포맷 자동시도) | 표준 승인 API(멱등) + 웹훅 서명 검증 |
| 전환 추적 | webhook → CApI Purchase | confirm 성공 시점에 CApI Purchase (더 정확) |

**목표:** 래피드 경로를 유지한 채 토스를 **provider 옵션으로 병행 추가**. 캠페인/상품 단위로 어느 provider 쓸지 선택 가능하게. 검증 끝나면 래피드 제거.

## 2. 범위 (P1)

- [ ] **카드 + 간편결제만** (토스페이·네이버페이 등). 즉시 시청 상품이라 가상계좌·계좌이체 제외 → 결제위젯에서 해당 수단 비노출
- [ ] 자체 `/checkout` 페이지 (상품·lead 컨텍스트 주입)
- [ ] 서버 승인 API `/api/toss/confirm`
- [ ] `orders.provider` 분기, 스키마 확장
- [ ] Meta CApI Purchase 연동 (기존 event_id 규칙 재사용)
- [ ] **결제완료 문자 발송** — `payment_success` 트리거 사용 (enum 에 이미 존재, schema.ts:36). 래피드는 자체 감사문자 의존해 미발송이었으나 토스는 없음 → 문구 seed + confirm 라우트에서 발송
- [ ] 관리자: 상품별 provider + 토스 상품키 설정 UI

**P1 제외:** 가상계좌/계좌이체(→ 웹훅·입금안내문자·pending 상태관리 불필요). 결제는 confirm 응답이 즉시 `DONE` 인 케이스만 다룸.

**P2 이후:** 가상계좌, 웹훅(`/api/toss/webhook`), 정기결제(빌링), 부분취소, 현금영수증 자동발급, 에스크로.

## 3. 결제 플로우 (V2 결제위젯)

```
[퍼널 CTA] --href="{{checkout}}"--> /checkout?p=<productId>&l=<leadId>&c=<campaignId>
     |
     v
/checkout (client)
  - tosspayments.widgets({ customerKey })   customerKey = leadId (비회원이면 ANONYMOUS — MCP확인 완료)
  - widgets.setAmount({ currency:"KRW", value: product.price })
  - widgets.renderPaymentMethods('#payment-method')
  - widgets.renderAgreement('#agreement')
  - [결제하기] -> widgets.requestPayment({
        orderId,                // 서버에서 발급한 유니크값 (예: toss_<uuid>)
        orderName: product.name,
        successUrl: /api/toss/confirm 로 리다이렉트되는 URL,
        failUrl: /checkout/fail,
        customerEmail, customerName, customerMobilePhone  // lead 값 프리필
    })
     |
     v  (성공 시 토스가 successUrl 로 redirect, query: paymentKey, orderId, amount)
/api/toss/confirm  (server, GET)
  1. orderId 로 pending_orders 조회 → 저장해둔 amount 와 query.amount 일치 검증 (위변조 차단)
  2. POST https://api.tosspayments.com/v1/payments/confirm
        Authorization: Basic base64(SECRET_KEY + ":")
        body: { paymentKey, orderId, amount }
  3. 응답 status === "DONE" 확인. (카드/간편결제는 항상 즉시 DONE.
     WAITING_FOR_DEPOSIT = 가상계좌 선택 시만 발생. 상점 어드민에서 가상계좌 비활성화 시 원천 차단. — MCP확인 완료)
  4. orders insert (provider="toss", tossPaymentKey, method, paidAt, status="success")
  5. lead.status = "purchased", updatedAt
  6. Meta CApI Purchase  eventId=`purchase.lead.<leadId>`  (기존 규칙 그대로)
  7. 결제완료 문자 — sendTriggerOnce(campaignId, "payment_success", lead)  (dedup+log)
  8. redirect -> {basePath}/vod?paid=1   (기존 PaidTracker 가 브라우저 픽셀 Purchase 발화)
     |
     v (실패)
/checkout/fail?code=&message=   -> 재시도 버튼
```

### 멱등성
- `confirm` API 는 토스가 멱등 보장 (같은 paymentKey 재요청 시 동일 응답).
- 우리 쪽은 `orders` 에 `tossPaymentKey` unique 인덱스 → 중복 insert 차단.
- confirm 라우트가 두 번 호출돼도 (유저 새로고침 등) lead.status·CApI 는 `alreadyPurchased` 가드로 1회만. (webhook route.ts:156 패턴 재사용)

### 가상계좌 — P1 제외 (결정됨)
즉시 시청 상품이므로 결제위젯에서 가상계좌·계좌이체 수단을 비노출.
`renderPaymentMethods`에 수단별 필터 파라미터 없음. 토스 상점관리자 > 결제 어드민에서 가상계좌·계좌이체 비활성화로 해결. — MCP확인 완료
→ webhook, pending_orders 의 pending 분기, 입금안내 문자 전부 P1 불필요. P2 로.

## 4. 스키마 변경

`src/db/schema.ts`:

```ts
// products — provider 무관 일반화 (기존 latpeed* 는 유지, deprecated 주석)
paymentProvider: text("payment_provider").notNull().default("latpeed"), // 'latpeed' | 'toss'
tossOrderName: text("toss_order_name"),   // 없으면 name 사용
// latpeedCheckoutUrl 은 provider='latpeed' 일 때만 의미

// orders — provider 분기
provider: text("provider").notNull().default("latpeed"),   // ✅ webhookEvents 엔 이미 있음, orders 엔 추가
tossPaymentKey: text("toss_payment_key"),
// latpeedOrderId 를 orderRef 로 일반화하거나, tossPaymentKey nullable 로 두고 latpeedOrderId 도 nullable 화
//   → 마이그레이션 부담 줄이려면: latpeedOrderId nullable + tossPaymentKey nullable + CHECK(둘 중 하나)

// 신규: 승인 전 주문 컨텍스트 (successUrl 위변조 방지용)
export const pendingOrders = pgTable("pending_orders", {
  orderId: text("order_id").primaryKey(),         // toss_<uuid>
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  leadId: uuid("lead_id").references(() => leads.id),
  productId: uuid("product_id").references(() => products.id),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("ready"), // ready | done | fail
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`webhook_events.provider` 는 이미 존재 → 토스 로그도 여기 `provider="toss"` 로 적재.

마이그레이션: `npm run db:push` (Neon). 기존 orders 데이터는 `provider` 기본값 'latpeed' 로 자동 채워짐.

## 5. 코드 매핑 (기존 구조 재사용)

| 신규/변경 | 기존 참고 |
|---|---|
| `src/lib/toss.ts` — confirm 호출, 서명검증 | `src/lib/meta-capi.ts` 스타일 |
| `src/lib/funnel-offer.ts` `Offer.checkoutUrl` | provider='toss' 면 `/checkout?p=..&l=..` 생성하도록 분기 |
| `src/components/funnel-views.tsx` metadata 주입 | 39-40, 72-73 라인 — checkoutUrl 생성 로직만 교체 |
| `src/puck/config.tsx` `{{checkout}}` 치환 | 412-415 라인 그대로 (URL 만 바뀜) |
| `/app/checkout/page.tsx` (신규, 퍼널 밖 or `(landing)` 그룹) | funnel-theme 래핑 |
| `/api/toss/confirm/route.ts` (신규) | `src/app/api/latpeed/webhook/route.ts:100-200` 의 lead매칭·order insert·lead전이·CApI 블록 이식 |
| `/api/toss/webhook/route.ts` (신규, 가상계좌만) | latpeed webhook 서명검증 구조 참고, 단 토스는 스펙 명확 |
| 관리자 상품폼 provider 선택 | `src/app/admin/(dash)/products` actions.ts |
| `/admin/settings` env 체크리스트에 토스 키 추가 | 기존 체크리스트 |

lead 연속성: `/checkout` 진입 시 `?l=` 없으면 `resolveLeadId`(fnl 쿠키 폴백) 사용 — 기존 `src/lib/lead.ts` 그대로.

## 6. 환경변수

```
NEXT_PUBLIC_TOSS_CLIENT_KEY=   # 결제위젯 클라이언트 키 (NEXT_PUBLIC_ 필수, 브라우저 노출 가능)
TOSS_SECRET_KEY=               # 승인 API 시크릿 키 — Basic base64(SECRET_KEY:) 로 인코딩
# TOSS_WEBHOOK_SECRET 불필요 (P1)
#  일반결제 웹훅(PAYMENT_STATUS_CHANGED)에는 서명 헤더 없음 — MCP확인 완료
#  가상계좌 웹훅만 secret 필드 검증, P1은 가상계좌 미사용이므로 웹훅 자체 불필요
```
- npm: `@tosspayments/tosspayments-sdk` (설치 완료)
- SDK 초기화: `import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk"`
- V2 API 엔드포인트: `https://api.tosspayments.com/v1/payments/confirm` (API는 여전히 v1)

테스트: 토스 테스트 클라이언트/시크릿 키 + 테스트 카드번호. `SOLAPI_DRY_RUN` 처럼 `TOSS_DRY_RUN` 불필요 (테스트 키가 곧 샌드박스).

## 7. 추적 / CApI (기존 규칙 유지)

- **checkout_start**: 기존 `CTAButton` 결제클릭 = `checkout_start` (track.ts) → `/checkout` 이동 전 그대로 발화.
- **Purchase (서버, CApI)**: `/api/toss/confirm` 성공 시 `sendMetaEvent({ eventName:"Purchase", eventId:`purchase.lead.${leadId}` })` — 픽셀 키는 캠페인 `metaPixelId`. webhook route.ts:164-199 블록 그대로 이식.
- **Purchase (브라우저 픽셀)**: confirm 이 `/vod?paid=1` 로 redirect → 기존 `PaidTracker` 가 발화, event_id 동일해 중복제거.
- 서버 DB Purchase 기록: 래피드는 "자체추적으로 충분"이라 생략했지만, **토스는 우리가 confirm 주체이므로 `orders` 에 확실히 남김.**

## 8. CRM / 문자 (결정됨)

- **결제완료 문자 발송.** `payment_success` 트리거(enum 이미 존재). `/api/toss/confirm` 성공 블록에서
  `sendTriggerOnce(campaignId, "payment_success", lead)` 호출 — dedup(message_logs lead+trigger unique) + 로그 + 야간이면 Solapi 예약발송(기존 `sendSms` 경유라 자동).
- 문구 seed 필요: `scripts/seed-crm-templates.ts` 에 `payment_success` 기본 템플릿 추가
  (예: `{이름}님, 결제가 완료되었습니다. 지금 바로 시청하세요 → {시청링크}`). 변수는 renderCampaignMessage 지원분 사용.
- `/admin/automation` 에서 캠페인별 편집 가능(전역 기본값 vs 캠페인 전용) — 트리거가 enum 에 있으므로 UI 자동 노출되는지만 확인.
- 가상계좌 입금안내 문자: P1 제외 (가상계좌 미사용).

## 9. 오픈 이슈

1. 토스 계약/심사 완료 시점? (사업자·정산계좌 심사 수일 소요) — 테스트 키로 선개발 가능
2. ~~가상계좌~~ → P1 제외 확정
3. 래피드 → 토스 전환: 캠페인별 점진 전환 vs 일괄 전환
4. 부분취소/환불 관리자 UI (P1 은 토스 대시보드 수동, P2 자동화)
5. `orderId` 발급 위치 — `/checkout` 서버컴포넌트에서 미리 pending_orders insert vs 클라에서 요청 시 API 호출
6. customerKey 정책 — leadId 재사용(간편결제 quick-pay 카드 저장 UX) vs 매번 익명
7. `payment_success` 문구 최종안 (캠페인 공통 vs 캠페인별)

## 10. 작업 순서 (구현 시)

1. 토스 MCP 로 V2 결제위젯 + 승인 API + 웹훅 문서 정독, `⚠️MCP확인` 항목 확정
2. 스키마 확장 + `db:push`
3. `src/lib/toss.ts` (confirm, 서명검증) + 테스트 키로 유닛
4. `/checkout` 페이지 + `/api/toss/confirm`
5. `funnel-offer.ts` / `funnel-views.tsx` provider 분기 (기본은 latpeed 유지)
6. 관리자 상품폼 provider 토글 → 테스트 상품 1개만 toss 로
7. `payment_success` 문구 seed + `/admin/automation` 노출 확인
8. 테스트 카드로 E2E (checkout → confirm → orders → 문자발송 → vod?paid=1 → CApI 이벤트매니저 확인)
9. 실 키 전환 + 소액 실결제 검증
10. (P2) 가상계좌 + `/api/toss/webhook`

---

## 11. 구독(빌링) — VOD 콘텐츠 멤버십 · P2

> 결정: 월 구독하면 계속 시청. **게이팅을 구독 상태로 전환.** 일회성 오퍼는 그대로 병행.

### 11.0 퍼널 내 위치 (중요)

```
무료 웨비나 → 48h VOD 무료창 → [만료] → 1:1 미팅 예약(되는시간) → 미팅에서 고가상품(100만+) 판매
                                                                          ↓ (구매/미팅 종료 후)
                                                              멤버십 전환 오퍼 (백엔드)
```

- **멤버십은 VOD 만료 화면의 CTA가 아니다.** 만료 화면 CTA = 기존대로 미팅 예약(booking).
- 멤버십 진입점 = 고가상품 세션이 끝난 lead 대상 **후속 오퍼**:
  - CRM 문자 링크 (`consulted` / `purchased` 상태 lead 에게 `membership_offer` 트리거)
  - 전용 페이지 `/membership` (또는 캠페인별 `/{slug}/membership`)
- 따라서 대상 lead.status 는 최소 `consulted` 이상. 멤버십 가입 시 `member` 로.
- 멤버십 가입자는 VOD 무기한 시청 → 게이팅 OR 조건은 그대로 유효(11.2).

### 11.1 빌링 흐름

```
① 빌링키 발급 (가입 시 1회)
   진입: /membership?l=<leadId>  (문자 링크 or 미팅 후 안내) → [가입하기] → /subscribe?p=<membershipProductId>&l=<leadId>
   → payment.requestBillingAuth({ method: "CARD" })  → successUrl에 authKey, customerKey — MCP확인 완료
   → requestBillingAuth('카드') → 카드등록창
   → successUrl(/api/toss/billing/issue) 에 authKey, customerKey
   → 서버: POST /v1/billing/authorizations/issue { authKey, customerKey }
        Authorization: Basic base64(SECRET_KEY + ":")
   → 응답: billingKey, card(issuer, number 마스킹)
   → subscriptions insert (status=active, currentPeriodEnd = now + 1개월)
   → 그 자리에서 1회차 즉시 결제 (아래 ② 호출)
   → lead.status = "member" (신규 상태값) / CApI: StartTrial 또는 Subscribe + Purchase

② 정기 청구 (크론 /api/cron/billing, 매일 1회)
   대상: subscriptions where status in (active, past_due) and currentPeriodEnd <= now + grace
   각 건:
     POST /v1/billing/{billingKey}
       { customerKey, amount, orderId: sub_<subId>_<yyyymm>, orderName }
     성공 → orders insert(provider=toss, 회차) + currentPeriodEnd += 1개월 + status=active
            + CApI Purchase(value=회차금액) + payment_success 문자(회차 안내)
     실패 → status=past_due, dunning: D+0/D+2/D+4 재시도 + 안내문자, D+5 실패 시 status=canceled
```

### 11.2 게이팅 변경 (`funnel-views.tsx` VodView)

현재: `lead.vodExpiresAt > now` (campaign.vodWindowHours, 기본 48h) 단일 판정.

변경: **OR 조건 추가** (게이팅만, 만료 화면 CTA 는 건드리지 않음)
```ts
const hasWindowAccess = lead.vodExpiresAt.getTime() > now.getTime();   // 기존 (웨비나 직후 무료시청)
const hasMembership   = await isActiveMember(lead.id);                 // 신규
//   isActiveMember = subscriptions where leadId, status='active', currentPeriodEnd > now  존재
const gate = (hasWindowAccess || hasMembership) ? "ok" : "expired";
```
- 만료 화면(`gate="expired"`) CTA = **기존대로 미팅 예약**. 멤버십 문구 넣지 않음.
- Countdown 블록: 멤버면 카운트다운 숨김(무기한), 아니면 기존 `vodDeadlineIso`
- 멤버십 VOD 라이브러리(여러 편)까지 가면 별도 페이지 필요 → 이건 P3, P2는 기존 단일 VOD 무기한 접근만

### 11.3 스키마 (P2)

```ts
export const subscriptions = pgTable("subscriptions", {
  id: uuid().defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  leadId: uuid("lead_id").references(() => leads.id).notNull(),
  productId: uuid("product_id").references(() => products.id),  // membership 상품
  billingKey: text("billing_key").notNull(),
  customerKey: text("customer_key").notNull(),        // = leadId
  cardInfo: text("card_info"),                        // "신한 1234" 마스킹
  status: text("status").notNull().default("active"), // active | past_due | canceled
  interval: text("interval").notNull().default("monthly"),
  amount: integer("amount").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// products: kind 컬럼 추가 'one_time' | 'membership', membership 이면 interval/amount 는 여기서
// leads.status enum 에 'member' 추가
// message_trigger enum: 'membership_offer'(수동) | 'membership_trial_ending'(전환 3일전) |
//   'membership_renewed' | 'membership_payment_failed' | 'membership_canceled'
// products: membershipFreeMonths integer default 0
// page_type enum 에 'membership' 추가 (campaign_pages)
```

### 11.4 해지

- P2: 사용자 마이페이지 없음 → CS가 관리자에서 해지 버튼. `/admin/crm/[id]` 에 구독 카드 + 해지.
- 해지 시: `status=canceled`, `canceledAt=now`. **currentPeriodEnd 까지는 시청 유지**(환불 아님), 이후 자동 게이팅 차단. billingKey 삭제 API 호출. ⚠️MCP확인 (billingKey 삭제 엔드포인트)
- P3: 사용자용 `/account` (Clerk 없이 lead 쿠키/매직링크 기반) 해지 셀프서비스

### 11.5 추적

- 가입: CApI `Subscribe`(또는 커스텀), value=월 구독료
- 회차 결제: `Purchase` value=회차금액, eventId=`purchase.sub.<subId>.<yyyymm>`
- 이탈(해지): 내부 지표만 (Meta 표준 이벤트 없음)

### 11.6 오픈 이슈 (구독)

- a. 정기결제 계약 심사 = 일회성과 별도. 일회성 안정화 후 신청.
- b. ~~48h 만료 CTA~~ → 미팅 예약으로 확정. 멤버십은 백엔드 오퍼(11.0).
- c. ✅ `membership_offer` = **관리자 수동 발송** (`/admin/crm/[id]` 에서 lead 선택 발송). 자동 트리거 아님.
- d. ✅ `/membership` = **캠페인별 Puck 페이지**. `page_type` enum 에 `membership` 추가, `campaign_pages` 로 관리, 빌더 `/admin/builder/[campaignId]/membership`. FunnelPage 에 pageType='membership' 분기.
- e. ✅ **N개월 무료 포함 후 유료 전환** (아래 11.7).
- f. ✅ 무료기간 = **1개월**. 첫 유료청구일 = 가입일 + 1개월, 이후 매월 같은 날.
- g. 결제 실패 dunning 주기/문자 카피
- h. 가격 변경 시 기존 구독자 처리 (grandfather)
- i. ✅ 멤버십 콘텐츠 = **콘텐츠 라이브러리** (매달 새 강의 추가). 별도 미니 LMS → **P3** (아래 11.8).

### 11.7 N개월 무료 포함 → 유료 전환

고가상품 구매자에게 멤버십 N개월 무료 제공, 이후 자동 유료 전환.

```
가입(빌링키 발급) 시:
  - subscriptions insert: status='active', amount=<월 구독료>,
    currentPeriodEnd = now + freeMonths (확정: 1개월)
  - 이 시점 청구 금액 = 0원 (빌링키만 발급, 결제 안 함). requestBillingAuth는 카드 등록만, 실결제는 /v1/billing/{billingKey} 별도 호출
  - lead.status='member', CApI: StartTrial
  - 안내문자: "N개월 무료, {전환일}부터 월 {금액} 자동결제. 언제든 해지 가능"

크론 /api/cron/billing:
  - currentPeriodEnd 도달 → 첫 유료 청구 POST /v1/billing/{billingKey}
    성공 → currentPeriodEnd += 1개월, membership_renewed 문자(첫 유료 전환 안내)
    실패 → past_due dunning

무료기간 중 해지:
  - status='canceled', currentPeriodEnd(=무료 종료일)까지 시청 유지, 이후 차단, 청구 없음
```

- `products.membershipFreeMonths` 컬럼 추가 (기본 0 = 무료기간 없음). **멤버십 상품 기본값 1**
- 전환 3일 전 리마인더 문자 권장 (`membership_trial_ending` 트리거) — 결제 분쟁·환불요청 감소

### 11.8 멤버십 콘텐츠 라이브러리 — P3 (미니 LMS)

> 결정: 회원 전용 영상 다수, 매달 신규 강의 추가. `/membership` 판매페이지(11.6d)와 별개로 회원 시청 공간.

- **`membership_contents` 테이블**: id, campaignId(또는 전역), title, description, videoSrc(Mux/URL), thumbnailUrl, publishAt(공개예약), sortOrder, createdAt
- **`/members` 라이브러리 페이지** (`page_type` 아님, 전용 라우트): active 멤버만 접근(`isActiveMember` 가드 재사용). 강의 목록 + 개별 플레이어 `/members/[contentId]`
- **관리자 `/admin/membership`**: 강의 CRUD, 영상 업로드(기존 Blob/Mux), 공개일 예약, 순서
- **회원별 시청 진도** (선택, P3 후반): `membership_progress` (leadId, contentId, lastPositionSec, completedAt)
- 신규 강의 공개 시 회원 알림 문자 (`membership_new_content` 트리거, 관리자 발송)
- 접근 상실(해지/미납) 시 `/members` 차단 → 기존 만료 화면 패턴 재사용
- Mux 도입 여부가 여기서 실질 필요해짐 (다편 스트리밍·조회수·DRM). 현재 CLAUDE.md 상 Mux 는 P2 로 표기 → 라이브러리 착수 전 확정
- 범위 큼: 별도 기획 문서 `docs/membership-lms-plan.md` 로 분리 권장
