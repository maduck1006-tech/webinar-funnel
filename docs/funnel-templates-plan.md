# 퍼널 템플릿 + 매칭 CRM 설계 (러셀 브런슨식)

**버전:** v0.1 (초안) · **작성일:** 2026-09-02 · **상태:** 검토 대기

> 목표: `/admin/campaigns/new` 에서 **퍼널 형태를 골라 클릭 한 번으로 완성된 퍼널 + 그에 맞는
> 자동 메시지 세트**가 생기게. 사장은 "무슨 퍼널을 만들지"만 정하고, 단계·문구·시퀀스는
> 검증된 템플릿에서 시작.

---

## 0. 브런슨의 퍼널 분류 → 우리 앱 매핑

브런슨은 퍼널을 **가치 사다리 위치 × 트래픽 온도**로 나눈다. 우리 앱이 가진 페이지 타입
(landing·sales·thankyou·vod·course·delivery·booking·groupchat·membership) + events + 엔타이틀먼트 +
자동 메시지 엔진으로 구현 가능한 것만 추린다.

| 브런슨 퍼널 | 사다리 위치 | 우리 템플릿 | 구현 |
|---|---|---|---|
| Lead Magnet / Squeeze | 최상단 (무료 캡처) | ① 무료 자료(리드마그넷) 퍼널 | landing→delivery, 무료 상품 |
| Perfect Webinar (evergreen) | 중간 (₩10만~100만) | ② 무료 세미나(에버그린) 퍼널 | **현재 기본** landing→thankyou→vod→종착 |
| Live Webinar | 중간 | ③ 라이브 세미나 신청 퍼널 | live_webinar_reg |
| Challenge (5-Day) | 중간~상단 유입 | ④ 챌린지 과정 퍼널 | landing→thankyou(단톡방)→course(드립)→sales |
| Application / Book-a-Call | 백엔드 (고가) | ⑤ 무료 상담 예약 퍼널 | landing→thankyou(사전영상)→booking |
| Two-Step Tripwire / VSL | 프론트엔드 (저가) | ⑥ 전자책·트립와이어 퍼널 | sales→checkout(범프+OTO)→thankyou→delivery |
| Sales Letter (course) | 프론트~중간 | ⑦ VOD 강의 판매 퍼널 | sales→checkout→(업셀→다운셀)→thankyou→course |
| Membership / Continuity | 연속 수익 | ⑧ 멤버십 퍼널 | sales→checkout(빌링)→thankyou→course |
| Survey / Quiz | 세분화 캡처 | (후속 — 퀴즈 빌더 필요) | — |

**말단 개념 정리**
- 각 템플릿 = `{ funnelType, terminalStep, flow.steps, 상품 슬롯[], 자동메시지 세트[], 페이지 카피 }`
- 상품 슬롯 = "이 퍼널엔 이런 상품이 필요해요" 체크리스트 (생성 후 채우도록 유도)
- 자동메시지 세트 = 캠페인 전용(campaignId 지정) 자동화로 복제, **기본 꺼짐** (사장이 문구 검토 후 켬)

---

## 1. 템플릿별 상세 + CRM

문구는 스케치. 변수: `{이름}{링크}{예약링크}{결제링크}{단톡방링크}{세일즈링크}{강의실링크}{다운로드링크}{라이브링크}{라이브일시}{라이브러리링크}{상품명}{마감시각}`
트리거: `signup / watch_start / purchase / booking / cart_abandon / event_registered`
대상: `all / not_watched / not_purchased / not_booked`

---

### ① 무료 자료(리드마그넷) 퍼널

**목적:** 이메일·번호 수집. 사다리 첫 계단. 브런슨: "무료 미끼로 이상적 고객만 낚는다."

- **단계:** `landing(신청)` → `delivery(다운로드)`
- **상품:** 무료 상품 1개 (type=ebook, price_mode=free) — placement=sales
- **종착:** delivery. 다운로드 뒤 다음 사다리(세미나/강의)로 크로스셀 유도.
- **funnelType:** ebook

**CRM (trigger: signup)**
| 지연 | 대상 | 문구 |
|---|---|---|
| 0분 | all | {이름}님, 신청하신 자료 여기 있어요.\n📎 {다운로드링크}\n폰에서도 다시 보려면: {라이브러리링크} |
| 1일 | all | {이름}님, 어제 받으신 자료 열어보셨어요? 3페이지 체크리스트부터 보시면 딱이에요.\n📎 {다운로드링크} |
| 3일 | all | 자료만으로 부족하셨다면, 같은 주제로 3시간 무료 강의도 열어뒀어요.\n👉 {세일즈링크} |

**stopOn:** purchase

---

### ② 무료 세미나(에버그린) 퍼널  ← 현재 기본

**목적:** Perfect Webinar. 콘텐츠로 신뢰 쌓고 오퍼. 브런슨 핵심 퍼널.

- **단계:** `landing` → `thankyou(즉시 시청 + 워크북 범프)` → `vod(48h, 오퍼 + 종착 CTA)` → `{종착}`
- **상품:** 저가 워크북 1개 (placement=both, 범프·업셀 슬롯)
- **종착:** groupchat(단톡방) 또는 booking(상담) 또는 sales(고가 오퍼)
- **funnelType:** evergreen_webinar

**CRM** — 이미 시드된 것 재사용 + 캠페인 전용 복제
| 자동화 | trigger | 요지 |
|---|---|---|
| signup_confirm | signup / 0분 | 시청 링크 즉시 |
| soap_opera | signup / 1~5일 | 5일 스토리텔링 → 오퍼 (stopOn: purchase, booking) |
| watch_deadline | signup / 24·36·47h | "48시간 남았어요" 시청 마감 압박 |
| watched_no_buy | watch_start / 2h·1d·2d, not_purchased | "봤는데 안 사신 분" 결제 유도 |
| cart_abandon | cart_abandon / 0·3h·20h | 결제하다 이탈 복구 |
| terminal_nudge | watch_start / +1d, not_booked(또는 종착 미완) | "{예약링크}" 또는 "{단톡방링크}" |

---

### ③ 라이브 세미나 신청 퍼널

**목적:** 날짜 잡힌 라이브 → 참석 압박이 에버그린보다 강함. 유튜브 라이브 등 외부 진행.

- **단계:** `landing(신청)` → `thankyou(일정·캘린더·라이브 링크)` → `vod(라이브 종료 후 리플레이 자동)` → `{종착}`
- **상품:** 리플레이/세미나 뒤 오퍼 상품
- **funnelType:** live_webinar_reg
- **필수:** 캠페인 설정에서 회차(일시·유튜브 URL) 등록

**CRM (trigger: event_registered, anchor=회차 시작시각)**
| 지연 | 문구 |
|---|---|
| -1440분(전날) | *(사전리마인더는 자동)* {이름}님, 내일 {라이브일시} 라이브예요!\n{라이브링크} |
| -60분 | 1시간 뒤 시작합니다. 미리 들어와 계세요.\n{라이브링크} |
| +90분(종료 직후) | 리플레이가 열렸어요. 놓친 부분 다시 보세요.\n📎 {링크} |
| +90분+45h | 리플레이가 곧 닫혀요. 지금 마무리하세요.\n📎 {링크} |

+ trigger: signup / not-attended 판단 어려우니 생략, 대신 event 앵커로 통일

---

### ④ 챌린지 과정 퍼널  ★ 브런슨 최애

**목적:** 5일간 매일 미션 → 습관·성취감 → 마지막 날 유료 프로그램 오퍼.
브런슨: "챌린지는 지금 가장 잘 되는 퍼널. 참여가 전환을 만든다."

- **단계:** `landing(신청)` → `thankyou(환영 + 단톡방 입장)` → `course(챌린지 = 무료 강의, 레슨 drip_days 0~4)` → `sales(졸업 오퍼)`
- **상품:**
  - 챌린지 콘텐츠 = type=vod_course, price_mode=free, 레슨마다 drip_days 0/1/2/3/4
  - 졸업 오퍼 = 유료 본상품 (placement=sales)
- **종착:** sales
- **funnelType:** vod_course (하지만 무료 진입)
- **커뮤니티:** groupchat_url (단톡방) 필수 — 챌린지는 커뮤니티가 엔진

**CRM (trigger: signup, anchor=신청)**
| Day | 지연 | 문구 |
|---|---|---|
| 0 | 0분 | {이름}님, 5일 챌린지 시작! 단톡방 먼저 들어오세요.\n👉 {단톡방링크}\nDay 1 미션: {강의실링크} |
| 1 | 1일 | Day 2 열렸습니다. 어제 미션 인증 안 하신 분? 지금이라도 단톡방에 올려주세요.\n{강의실링크} |
| 2 | 2일 | Day 3. 여기서 절반이 포기해요. {이름}님은 남으실 거죠?\n{강의실링크} |
| 3 | 3일 | Day 4. 내일이 마지막이에요. 오늘 미션이 제일 중요합니다.\n{강의실링크} |
| 4 | 4일 | Day 5 — 마지막 미션 + 다음 단계 안내가 오늘 들어있어요.\n{강의실링크} |
| 졸업 | 5일 | {이름}님, 5일 완주 축하해요! 여기서 멈추지 마세요. 다음 단계는 이겁니다.\n👉 {세일즈링크} |
| 졸업+1 | 6일 | 어제 안내한 {상품명}, 챌린지 완주자 특가는 오늘까지예요.\n👉 {세일즈링크} |

**stopOn:** purchase
**미완주자 트랙(별도 자동화, audience=not_started_course 도입 시):** "Day 2 미션 아직이에요" 등

---

### ⑤ 무료 상담 예약 퍼널 (Application / Book-a-Call)

**목적:** 백엔드 고가. 상담 통화에서 클로징. 브런슨: "고가는 페이지가 아니라 사람이 판다."

- **단계:** `landing(신청)` → `thankyou(통화 전 꼭 볼 3분 영상 + 예약 버튼)` → `booking(되는시간)`
- **상품:** 없음(무료 상담) 또는 유료 상담권(paid_consult)
- **종착:** booking
- **funnelType:** paid_consult (무료면 landing 진입)
- **thankyou:** Video 블록(사전 프레이밍) + CTA `{{next}}` → booking

**CRM**
| trigger | 지연 | 대상 | 문구 |
|---|---|---|---|
| signup | 0분 | all | {이름}님, 상담 신청 접수됐어요. 아직 시간은 안 잡히셨어요 — 여기서 선택해 주세요.\n👉 {예약링크}\n먼저 3분 영상 보고 오시면 상담이 훨씬 알차요. |
| signup | 1시간 | not_booked | {이름}님, 시간표가 매주 빨리 차요. 이번 주 자리 몇 개 안 남았습니다.\n👉 {예약링크} |
| signup | 1일 | not_booked | {이름}님, 상담 자리 아직 안 잡으셨네요. 이 링크는 3일 뒤 닫힙니다.\n👉 {예약링크} |
| signup | 3일 | not_booked | 마지막 안내예요. 오늘 안 잡으시면 대기 명단으로 넘어갑니다.\n👉 {예약링크} |
| booking | 0분 | all | {이름}님, {상담일시} 상담 확정됐어요. 통화 전에 준비할 것 3가지를 문자로 정리해 보내드릴게요. |
| booking | -1440분 | all | 내일 상담이에요. 조용한 곳 + 필기도구 준비해 주세요. |
| booking | -60분 | all | 1시간 뒤 상담입니다. 링크: {예약링크} |

*(booking 트리거 앵커=예약시각, 음수 지연은 lib/events 방식 별도 처리 필요 — 현재 booking 자동화는 양수만. 상담 리마인더는 되는시간 자체 알림으로 대체 가능)*

---

### ⑥ 전자책·트립와이어 퍼널

**목적:** 자기 청산(SLO) 프론트엔드. 광고비 회수 + 구매자 리스트.

- **단계:** `sales(VSL/세일즈레터)` → `checkout(오더범프 + 원클릭 업셀)` → `thankyou` → `delivery`
- **상품:** 본상품(저가) + 범프 + 업셀 + 다운셀 슬롯
- **종착:** delivery
- **funnelType:** ebook

**CRM**
| trigger | 지연 | 대상 | 문구 |
|---|---|---|---|
| cart_abandon | 0·3h·20h | not_purchased | 결제 이탈 복구 (시드 재사용) |
| purchase | 0분 | all | {이름}님, 결제 완료! 바로 받으세요.\n📎 {다운로드링크}\n{라이브러리링크} 에서 언제든 다시 볼 수 있어요. |
| purchase | 2일 | all | {이름}님, {상품명} 잘 보고 계세요? 실전으로 넘어갈 준비 되셨으면 이것도 보세요.\n👉 {세일즈링크} (크로스셀) |

---

### ⑦ VOD 강의 판매 퍼널

- **단계:** `sales` → `checkout` → `(upsell → downsell)` → `thankyou` → `course`
- **상품:** 강의(vod_course) + 업셀(심화/코칭) + 다운셀
- **종착:** course
- **funnelType:** vod_course

**CRM**
| trigger | 지연 | 대상 | 문구 |
|---|---|---|---|
| cart_abandon | 0·3h·20h | not_purchased | 이탈 복구 |
| purchase | 0분 | all | {이름}님, 결제 완료! 강의실 바로 입장하세요.\n👉 {강의실링크} |
| purchase | 1일 | all | Day 1 완료하셨어요? 첫 모듈만 끝내도 절반은 온 거예요.\n{강의실링크} |
| purchase | 3일 | all | {이름}님, 3일째예요. 여기서 멈추는 분들이 많은데 딱 10분만 더 봐주세요.\n{강의실링크} |
| purchase | 7일 | all | 완주하신 분들 후기가 단톡방에 올라와요. {이름}님 차례입니다.\n{강의실링크} |
| purchase | 10일 | all | 강의 다 보셨으면 다음 단계 — {세일즈링크} (업셀/코칭 크로스셀) |

*(lesson_stalled 트리거는 후속. 지금은 purchase 앵커 고정 지연)*

---

### ⑧ 멤버십 퍼널

- **단계:** `sales(멤버십 오퍼)` → `checkout(빌링 인증)` → `thankyou` → `course`
- **상품:** type=membership, membershipFreeMonths(예 1)
- **funnelType:** vod_course (또는 전용)

**CRM**
| trigger | 지연 | 문구 |
|---|---|---|
| purchase | 0분 | {이름}님, 멤버십 시작! 첫 달은 무료예요. 지금 볼 수 있는 것부터: {강의실링크} |
| purchase | 3일 | 첫 주에 하나만 끝내도 본전. 이번 주 추천 강의는 이거예요. |
| purchase | 25일 | {이름}님, {마감시각}에 첫 결제가 진행돼요. 계속 이용하시면 아무것도 안 하셔도 됩니다. |
| *(회차실패)* | — | (billing.ts dunning + 별도 자동화) 카드가 승인되지 않았어요. 여기서 갱신해 주세요. |

---

## 2. 아키텍처

### 2-1. 템플릿 레지스트리 = 코드 상수 (DB 아님)

`src/lib/funnel-templates.ts` — 우리가 큐레이션. 사장이 수정 못 함(수정은 만든 뒤 캠페인에서).

```ts
export type FunnelTemplate = {
  key: string;                // 'free_consult' | 'evergreen_webinar' | 'challenge' ...
  name: string;               // "무료 상담 예약 퍼널"
  tagline: string;            // 한 줄 설명
  icon: string;
  ladderStage: "lead" | "frontend" | "presentation" | "backend" | "continuity";
  funnelType: string;
  terminalStep: string;
  steps: string[];            // pageType 순서 (flow.steps 시드)
  pageOverrides?: Partial<Record<string, FunnelData>>;  // 템플릿 맞춤 카피
  productSlots: {
    key: string;              // 'main' | 'bump' | 'upsell' | 'challenge_content' | 'grad_offer'
    label: string;            // "졸업 오퍼 상품"
    placement: string;        // 'sales' | 'both' | ...
    productType: string;      // 'ebook' | 'vod_course' | 'coaching' | 'membership'
    priceMode?: "paid" | "free";
    required: boolean;
  }[];
  automations: {
    key: string;
    name: string;
    trigger: string;
    stopOn: string[];
    steps: { delayMinutes: number; audience: string; body: string }[];
  }[];
};
```

### 2-2. 생성 플로우 — `/admin/campaigns/new` 개편

**1단계: 템플릿 선택** (카드 그리드)
```
[리드마그넷]  [무료 세미나]  [라이브 세미나]  [챌린지]
[무료 상담]   [전자책]      [강의 판매]     [멤버십]
[빈 캠페인]
```
각 카드: 아이콘 + 이름 + 태그라인 + "포함: 3단계, 자동메시지 5개, 상품 슬롯 2개"

**2단계: 이름 / slug** (기존, slug 자동생성)

**생성 시:**
1. `campaigns` insert — funnelType, terminalStep, `flow` = seed(template.steps)
2. `campaign_pages` — template.pageOverrides ?? defaultPages, 발행
3. `message_automations` (campaignId=이 캠페인, key=template.automations[].key) + steps — **enabled=false**
4. `campaign_setup_tasks` (신규 경량 테이블 또는 파생) — productSlots 를 "할 일" 로:
   - "졸업 오퍼 상품을 만들고 이 퍼널에 연결하세요" → /admin/products?forCampaign=... 링크
5. 캠페인 허브에 **"퍼널 설정 체크리스트"** 카드:
   - ☐ 상품 슬롯 N개 채우기
   - ☐ 자동 메시지 문구 검토 후 켜기 (N개)
   - ☐ (라이브면) 회차 일정 등록
   - ☐ 페이지 카피 채우기 (미발행/기본값 페이지 표시)
   - ☑ 완료 시 "발행 준비 완료"

### 2-3. 상품 슬롯 채우기

허브 체크리스트에서 "졸업 오퍼 상품 만들기" → 상품 폼(타입 프리필) → 저장 시 자동으로
`campaign_products(placement)` 매핑까지. 슬롯 key ↔ campaign_products 를 잇는 매핑은
`campaigns.metadata.slots` jsonb 로 가볍게.

---

## 3. 브런슨이 강조할 3가지 (템플릿에 녹일 원칙)

1. **하나의 목표, 하나의 CTA** — 각 페이지는 다음 한 걸음만. 템플릿 페이지 카피가 이걸 강제.
2. **후속이 매출의 80%** — 템플릿마다 CRM 세트가 "기본 딸려옴". 사장이 안 만들어도 됨.
3. **가치 사다리 상승** — 모든 템플릿의 마지막 CRM 스텝은 "다음 계단" 오퍼(`{세일즈링크}` 크로스셀).
   리드마그넷 → 세미나 → 강의 → 상담/멤버십.

---

## 4. 단계별 실행

| Phase | 범위 | 완료 기준 |
|---|---|---|
| **T1 레지스트리 + 생성** | `funnel-templates.ts` (템플릿 4개: 세미나·상담·챌린지·전자책) · `/admin/campaigns/new` 카드 선택 · 생성 시 flow+pages+automations(꺼짐) 시드 | 템플릿 골라 캠페인 만들면 단계·문구 세트가 딸려옴 |
| **T2 설정 체크리스트** | 허브에 "퍼널 설정 체크리스트" 카드 · 상품 슬롯 → 상품 생성/매핑 원클릭 · 미완료 항목 추적 | 사장이 체크리스트만 따라 발행까지 |
| **T3 템플릿 확장** | 나머지 4개(리드마그넷·라이브·강의판매·멤버십) + 페이지 카피 정교화 | 8종 템플릿 |
| **T4 미완주 트랙** | `messageAudience` += not_started_course / not_downloaded / not_joined_chat / not_attended · 챌린지 미완주 등 조건부 시퀀스 | 행동 기반 세분화 |

---

## 5. 열린 질문

1. 자동화 세트를 **켜진 채로** 시드할지, **꺼진 채로**(문구 검토 강제)일지. → 꺼짐 추천.
2. 페이지 카피를 템플릿마다 다 쓸지, 공용 defaultPages + 템플릿은 몇 개만 오버라이드할지. → 후자.
3. 상품 슬롯 미완성인 채로 발행 허용할지(경고만) vs 차단.
4. 챌린지 "무료 강의 + 드립" 을 course 로 할지 vod 다회차로 할지. → course + drip_days.
5. 템플릿을 사장이 "내 템플릿으로 저장"(만든 캠페인을 재사용 템플릿화) 할 수 있게 할지. → T4 이후.
