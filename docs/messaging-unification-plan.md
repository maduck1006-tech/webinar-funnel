# 메시지 시스템 통합 기획 — "자동 메시지"

> 상태: 기획. `automation_triggers`(고정 트리거) + `message_sequences`(시퀀스 빌더, 방금 착수) 두 시스템을 하나로.
> 목표: 관리자가 문자를 관리하는 곳이 **한 군데**. "고정 트리거"와 "시퀀스"의 구분을 없앤다.

---

## 1. 핵심 통찰

**고정 트리거는 이미 시퀀스의 특수한 형태다.**

| 지금 고정 트리거 | = 시퀀스로 표현하면 |
|---|---|
| `signup_confirm` | 시작=신청 · 스텝 1개(0분 뒤, 전원) |
| `reminder_24h` / `36h` / `47h` | 시작=신청 · 스텝 3개(24/36/47시간, 미시청) — **하나의 "시청 마감 리마인더"로 통합** |
| `pre_payment_nudge` | 시작=시청 시작 · 스텝 1개(30분 뒤, 미결제) |
| `payment_success` | 시작=결제 · 스텝 1개(0분 뒤, 전원) |

→ 세상의 모든 CRM 문자는 **`{시작 이벤트} + {N일 뒤} + {대상 조건} + {본문}`**. 이거 하나로 통일.

---

## 2. 통합 모델

```
message_automations                     (= 지금 automation_triggers + message_sequences)
  id
  campaign_id      NULL = 전역 기본(모든 캠페인 상속) | uuid = 캠페인 전용
  key              NULL = 사용자 생성 | 'signup_confirm' 등 = 시스템 기본
  name             표시명 ("신청 후 5일 스토리")
  trigger          signup | watch_start | purchase | booking | manual
  enabled
  stop_on          jsonb  예: ["purchase","booking"] — 이 이벤트 나면 이 자동화 중단
  created_at / updated_at

message_automation_steps                (= sequence_steps)
  id, automation_id, step_order
  delay_minutes    trigger 시점(앵커) 기준
  audience         all | not_watched | not_purchased | not_booked
  body             SMS 템플릿 ({이름}{링크}{예약링크}{결제링크}{상품명}{마감시각}{다운로드링크})
  enabled

message_automation_enrollments          (= sequence_enrollments)
  id, automation_id, lead_id
  anchor_at        지연 계산 기준 시각 (= trigger 발생 시각)
  status           active | done | stopped
  UNIQUE(automation_id, lead_id)

message_sends                           (= message_logs + sequence_sends 통합)
  id, lead_id, automation_step_id
  status           sent | skipped | failed
  channel          sms   (future: email, kakao)
  provider_message_id, error, sent_at, created_at
  UNIQUE(lead_id, automation_step_id)
```

### 앵커(anchor) — trigger별 지연 기준 시각

| trigger | anchor_at | 등록 지점 |
|---|---|---|
| `signup` | `lead.created_at` | `/api/leads` after() |
| `watch_start` | `lead.first_watched_at` | 시청 최초 기록 시 (신규 hook 필요) |
| `purchase` | `order.paid_at` | `/api/toss/confirm` |
| `booking` | 예약 확정 시각 | 되는시간 webhook |
| `manual` | `now()` | 관리자 CRM에서 등록 |

---

## 3. 관리자 UX — `/admin/automation` 한 페이지로

`/admin/sequences` 는 제거, `/admin/automation` 에 흡수.

```
자동 메시지                                  [캠페인: 전체 공통 ▾]

  시스템 기본 (모든 캠페인)
  ┌────────────────────────────────────────────────┐
  │ ✅ 신청 확인            신청 시 · 문자 1개        │ →
  │ ✅ 시청 마감 리마인더    신청 시 · 문자 3개        │ →   (24h·36h·47h, 미시청)
  │ ✅ 결제 유도            시청 시작 시 · 문자 1개    │ →
  │ ✅ 결제 완료 안내        결제 시 · 문자 1개        │ →
  └────────────────────────────────────────────────┘

  이 캠페인 전용                              [+ 새 자동 메시지]
  ┌────────────────────────────────────────────────┐
  │ ✅ 신청 후 5일 스토리    신청 시 · 문자 5개        │ →
  └────────────────────────────────────────────────┘
```

- **캠페인 = "전체 공통"** → 전역 기본값 편집 (모든 캠페인에 영향)
- **캠페인 선택** → 그 캠페인은 기본값 상속. "이 캠페인만 수정" 누르면 해당 automation 의 캠페인 전용 복사본 생성 (지금 `campaign_messages` 오버라이드와 동일 개념, 단 automation 통째 단위)
- automation 클릭 → 스텝 편집기 (지금 `/admin/sequences/[id]` UI 그대로: 며칠 뒤 / 누구에게 / 본문)

---

## 4. 즉시 발송 vs 크론

- `delay_minutes == 0` 이고 trigger 가 요청 경로에서 발생 → **그 자리에서 동기 발송** (지금 `signup_confirm` 즉시 발송·야간에도 발송 유지). `runAutomationNow(leadId, trigger)`.
- `delay_minutes > 0` → 크론이 처리. `/api/cron/reminders` 에 통합 (이미 `runDueSequenceSteps` 호출하도록 방금 연결함 → `runDueAutomationSteps` 로 이름만).

---

## 5. stop_on — 김빠진 문자 방지

`시청 마감 리마인더` 는 `stop_on: ["purchase","booking"]`.
결제·예약이 확정되면 해당 lead 의 그 automation enrollment 를 `stopped` 로.
(스텝의 `audience` 필터로도 커버되지만, `stop_on` 은 "이 사람은 이 흐름 졸업" 이 명시적이라 CRM 에서 보기 좋음.)

---

## 6. 마이그레이션 (`scripts/migrate-messaging.ts`, 1회성·안전)

1. `automation_triggers` → `message_automations`(campaign_id=NULL, key 유지) + 스텝 1개
   - **예외**: `reminder_24h/36h/47h` 3개 → `watch_deadline` automation 1개 + 스텝 3개
2. `campaign_messages` → 캠페인 전용 `message_automations` 복사본 + 오버라이드 body
3. `message_logs` → 그대로 보존(과거 기록). `message_sends` 는 새로 시작 (dedup 은 앞으로만 의미)
4. `automation_triggers` / `campaign_messages` / `message_sequences*` 는 1 릴리스 deprecated 유지 후 제거
5. `scripts/seed-crm-templates.ts` → 시스템 기본 automation seed 로 대체

---

## 7. 코드 변경

| 파일 | 변경 |
|---|---|
| `src/lib/messaging.ts` (신규) | `campaign-messages.ts` + `sequences.ts` 통합. `enrollLead(leadId,trigger)` · `runAutomationNow` · `runDueAutomationSteps` · `stopAutomations(leadId,event)` · `buildMessageVars`/`fillTemplate`(이미 추출됨) |
| `src/app/api/leads/route.ts` | `enrollLead(id,'signup')` + delay-0 즉시 발송 |
| `src/app/api/toss/confirm/route.ts` | `enrollLead(id,'purchase')` + `stopAutomations(id,'purchase')` |
| `src/app/api/whattime/webhook/route.ts` | `enrollLead(id,'booking')` + `stopAutomations(id,'booking')` |
| 시청 시작 hook | `first_watched_at` 세팅되는 곳 찾아 `enrollLead(id,'watch_start')` |
| `src/app/api/cron/reminders/route.ts` | 하드코딩 리마인더 로직 제거 → `runDueAutomationSteps()` 만 |
| `src/app/admin/(dash)/automation/**` | automation 목록 + 스텝 편집기(sequences UI 이식). `/admin/sequences` 삭제 |
| `src/app/admin/(dash)/crm/[id]/**` | enrollment 카드·타임라인 (이미 완료) — 테이블명만 |

---

## 8. 작업 순서

1. 스키마: `message_automations` / `_steps` / `_enrollments` / `message_sends` 추가 (기존 테이블 유지) → `db:push`
2. `src/lib/messaging.ts` 작성 + 유닛(테스트키·DRY_RUN)
3. 마이그레이션 스크립트 → 실행 → 데이터 확인
4. 3개 route + 크론 전환 (기존 `sendTriggerOnce`/`runDueSequenceSteps` 호출을 새 함수로)
5. `/admin/automation` 페이지 재작성 (목록 + 편집기)
6. `/admin/sequences` 제거, 사이드바 정리, CLAUDE.md 갱신
7. E2E: 신청→확인문자 / 미시청 3연타 / 결제→중단 / 수동등록
8. 1 릴리스 후 구 테이블 drop

---

## 9. 최소안 (풀 통합이 부담되면)

스키마 통합 없이 **관리자 화면만** 합치기:
- `/admin/automation` 에 탭 2개: "기본 트리거" (기존) + "시퀀스" (기존 `/admin/sequences` 내용)
- 백엔드는 그대로 두 시스템
- 빠르지만 근본 문제(개념 2개)는 남음 → **권장 안 함**, §2~8 풀 통합이 정답
