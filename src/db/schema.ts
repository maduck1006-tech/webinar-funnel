import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * 퍼널 진행 상태 (PRD 6.4)
 * 신청완료 → 시청시작 → 시청완료 → 저가구매완료 → 상담예약완료 → 상담완료
 * 이탈: 미시청만료 / 구매안함
 */
export const leadStatus = pgEnum("lead_status", [
  "applied",
  "watching",
  "watched",
  "purchased",
  "booked",
  "consulted",
  "expired",
  "no_purchase",
  // P2 구독: 멤버십 가입자 (docs/toss-payments-plan.md §11)
  "member",
]);

export const messageTrigger = pgEnum("message_trigger", [
  "signup_confirm",
  "reminder_24h",
  "reminder_12h_left",
  "reminder_1h_left",
  "pre_payment_nudge",
  "payment_success",
  "payment_cancel_admin",
  // P2 구독(멤버십) 관련 트리거 (docs/toss-payments-plan.md §11)
  "membership_offer", // 미팅/고가상품 세션 후 관리자 수동 발송
  "membership_trial_ending", // 무료기간(1개월) 종료 3일 전
  "membership_renewed", // 회차 결제 성공
  "membership_payment_failed", // 회차 결제 실패(dunning)
  "membership_canceled", // 해지 확정
]);

export const messageStatus = pgEnum("message_status", [
  "pending",
  "sent",
  "failed",
]);

export const orderStatus = pgEnum("order_status", [
  "success",
  "cancel",
  "webhook_missing",
  // 가상계좌 입금대기 등 승인 미확정 (P1 은 미사용, P2/후속 대비)
  "pending",
]);

/** 퍼널 페이지 종류 (캠페인마다 각 1개) */
export const pageType = pgEnum("page_type", [
  "landing",
  "thankyou",
  "vod",
  "booking",
  // P2 구독: 멤버십 전환 판매 페이지 (docs/toss-payments-plan.md §11)
  "membership",
]);

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "live",
  "archived",
]);

/**
 * 캠페인 = 웨비나 오퍼 한 벌 (광고→랜딩→땡큐→VOD→예약 + 설정).
 * 새 캠페인은 템플릿/기존 캠페인 복제로 생성. `/{slug}` 로 서빙.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    /** '/' rewrite 대상 (1개만 true) */
    isDefault: boolean("is_default").notNull().default(false),
    /** 새 캠페인 복제 소스로 노출 */
    isTemplate: boolean("is_template").notNull().default(false),
    /** 랜딩 A/B 테스트 진행 중 (variant a/b 50:50 분배) */
    abLanding: boolean("ab_landing").notNull().default(false),

    // 콘텐츠 / 연동
    vodSrc: text("vod_src"),
    vodWindowHours: integer("vod_window_hours").notNull().default(48),
    bookingEmbedUrl: text("booking_embed_url"),
    /** 워크북/자료 다운로드 URL — 문자 템플릿 {다운로드링크} 로 치환 */
    downloadUrl: text("download_url"),
    /** 결제 후 이동 URL. 비우면 /{slug}/vod */
    checkoutRedirectUrl: text("checkout_redirect_url"),

    // 카운트다운
    countdownMode: text("countdown_mode").notNull().default("none"), // none | fixed | evergreen
    countdownDeadline: timestamp("countdown_deadline", { withTimezone: true }),
    countdownRushSeconds: integer("countdown_rush_seconds"),

    // 추적
    metaPixelId: text("meta_pixel_id"),
    ga4MeasurementId: text("ga4_measurement_id"),
    /** Meta 광고 지표 수집: 계정 ID(act_ 접두 없이 숫자). 비우면 env META_AD_ACCOUNT_ID */
    metaAdAccountId: text("meta_ad_account_id"),
    /** 이 캠페인에 귀속할 Meta 광고 캠페인 ID 목록. 비우면(기본 캠페인 한정) 계정 전체 광고비 귀속 */
    metaAdCampaignIds: jsonb("meta_ad_campaign_ids").$type<string[]>(),
    googleAds: jsonb("google_ads").$type<{
      conversionId?: string;
      labels?: { lead?: string; purchase?: string; booking?: string };
    }>(),
    defaultUtmCampaign: text("default_utm_campaign"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("campaigns_slug_idx").on(t.slug)],
);

/** slug 변경 시 이전 slug → 캠페인 (광고 링크 보호, 301) */
export const campaignSlugRedirects = pgTable("campaign_slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 2단계에서 수집하는 고객 DB. created_at 이 모든 CRM 트리거의 기준 시각 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** 어느 캠페인에서 유입됐는지. 마이그레이션 중 nullable → backfill 후 not null 예정 */
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    /** A/B: 신청 시 본 랜딩 변형 ('a' | 'b') */
    landingVariant: text("landing_variant"),
    name: text("name"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    status: leadStatus("status").notNull().default("applied"),
    /** 개인정보 수집·이용 동의 시각 (null = 동의 도입 전 리드) */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    /** 광고 유입 추적 (PRD Open Q9). first-touch utm 병합 저장 */
    utm: jsonb("utm").$type<Record<string, string>>(),
    /** Meta 클릭 식별자 — CApI user_data + 광고 귀속용 */
    fbc: text("fbc"),
    fbp: text("fbp"),
    fbclid: text("fbclid"),
    /** CApI user_data (해싱 전 원본은 저장 안 함, IP/UA 는 필요) */
    clientIp: text("client_ip"),
    clientUa: text("client_ua"),
    /** 최초 진입 URL / 리퍼러 (귀속 디버깅) */
    landingUrl: text("landing_url"),
    referrer: text("referrer"),
    firstWatchedAt: timestamp("first_watched_at", { withTimezone: true }),
    /** DB 입력 시점 + 48h. 시청 만료 판정에 사용 */
    vodExpiresAt: timestamp("vod_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_email_idx").on(t.email),
    index("leads_phone_idx").on(t.phone),
    index("leads_status_idx").on(t.status),
    index("leads_campaign_idx").on(t.campaignId),
  ],
);

/** 관리자가 직접 CRUD 하는 저가 상품 (PRD 4.1 / 6.3) */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  /** 원 단위 */
  price: integer("price").notNull(),
  compareAtPrice: integer("compare_at_price"),
  active: boolean("active").notNull().default(true),
  showFrom: timestamp("show_from", { withTimezone: true }),
  showUntil: timestamp("show_until", { withTimezone: true }),
  /** @deprecated 래피드 제거됨. 컬럼은 과거 데이터 위해 유지 */
  latpeedProductId: text("latpeed_product_id"),
  /** @deprecated 래피드 제거됨 */
  latpeedCheckoutUrl: text("latpeed_checkout_url"),
  /** 노출 위치: 'thankyou' | 'vod_bottom' | 'both' */
  placement: text("placement").notNull().default("both"),
  /** @deprecated 결제는 전부 자체 토스 결제. 항상 'toss' */
  paymentProvider: text("payment_provider").notNull().default("toss"),
  /** 상품 종류: 'one_time' | 'membership' (구독)  */
  kind: text("kind").notNull().default("one_time"),
  /** toss 결제창 orderName (없으면 name 사용) */
  tossOrderName: text("toss_order_name"),
  /** 멤버십 무료 개월 수 (0 = 없음, 멤버십 기본 1). §11.7 */
  membershipFreeMonths: integer("membership_free_months").notNull().default(0),
  /**
   * 오더 범프: 이 상품 주문서에 체크박스로 붙는 추가 상품 (클릭퍼널스 order bump).
   * 같은 결제건에 합산 결제됨. 상대 상품도 paymentProvider='toss' 여야 함.
   */
  bumpProductId: uuid("bump_product_id"),
  /** 범프 체크박스 옆 설득 문구 (없으면 상품 설명 사용) */
  bumpDescription: text("bump_description"),
  /**
   * 원클릭 업셀(OTO): 결제 완료 직후 뜨는 업셀 상품. 저장된 카드(빌링키)로 1클릭 결제.
   * 이 값이 있으면 주문서가 빌링키 발급 방식으로 동작함.
   */
  upsellProductId: uuid("upsell_product_id"),
  /** 업셀 거절 시 뜨는 다운셀 상품 (선택) */
  downsellProductId: uuid("downsell_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 확정된 주문.
 * - latpeed: 웹훅으로 확정 (latpeedOrderId)
 * - toss: /api/toss/confirm 서버승인으로 확정 (tossPaymentKey). §3
 * 구독 회차 결제도 여기 1행씩 적재 (provider='toss', subscriptionId 채움).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    leadId: uuid("lead_id").references(() => leads.id),
    productId: uuid("product_id").references(() => products.id),
    /** 'toss' (과거: 'latpeed') */
    provider: text("provider").notNull().default("toss"),
    /** @deprecated 래피드 주문 ID (과거 데이터) */
    latpeedOrderId: text("latpeed_order_id"),
    /** toss paymentKey */
    tossPaymentKey: text("toss_payment_key"),
    /** 구독 회차 결제면 해당 구독 (§11) */
    subscriptionId: uuid("subscription_id"),
    /** 주문 성격: 'main' | 'upsell' | 'downsell' | 'subscription' */
    orderRole: text("order_role").notNull().default("main"),
    /** 오더 범프가 함께 결제됐으면 그 상품 (amount 에 범프가격 포함) */
    bumpProductId: uuid("bump_product_id"),
    /** 범프 부분 금액 (원) */
    bumpAmount: integer("bump_amount"),
    email: text("email"),
    phone: text("phone"),
    amount: integer("amount").notNull(),
    status: orderStatus("status").notNull(),
    method: text("method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // NULLS DISTINCT (PG 기본) → provider 별로 한쪽만 채워도 유니크 충돌 없음
    uniqueIndex("orders_latpeed_order_id_idx").on(t.latpeedOrderId),
    uniqueIndex("orders_toss_payment_key_idx").on(t.tossPaymentKey),
  ],
);

/**
 * 승인 전 주문 컨텍스트. toss successUrl 위변조(금액 조작) 방지용.
 * /checkout 에서 orderId 발급하며 insert → /api/toss/confirm 에서 조회·검증. §3
 */
export const pendingOrders = pgTable("pending_orders", {
  /** toss_<uuid> 형식, toss requestPayment 의 orderId */
  orderId: text("order_id").primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  leadId: uuid("lead_id").references(() => leads.id),
  productId: uuid("product_id").references(() => products.id),
  /** 합산 결제 금액 (본상품 + 범프). successUrl amount 와 대조 */
  amount: integer("amount").notNull(),
  /** 오더 범프가 선택됐으면 그 상품 */
  bumpProductId: uuid("bump_product_id"),
  /** 범프 부분 금액 */
  bumpAmount: integer("bump_amount"),
  /** 'main' | 'upsell' | 'downsell' — 완료 시 orders.orderRole 로 전달 */
  role: text("role").notNull().default("main"),
  /** 'ready' | 'done' | 'fail' */
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 구독(멤버십). toss 빌링키 기반 자동결제. §11
 * 접근 판정: status='active' && currentPeriodEnd > now  (funnel-views VodView 게이팅 OR 조건)
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    leadId: uuid("lead_id")
      .references(() => leads.id)
      .notNull(),
    productId: uuid("product_id").references(() => products.id),
    /** toss 빌링키 (카드정보 대신 저장하는 토큰) */
    billingKey: text("billing_key").notNull(),
    /** toss customerKey (= leadId) */
    customerKey: text("customer_key").notNull(),
    /** 마스킹 카드정보 표시용 "신한 1234" */
    cardInfo: text("card_info"),
    /** 'active' | 'past_due' | 'canceled' */
    status: text("status").notNull().default("active"),
    /** 'monthly' 등 */
    interval: text("interval").notNull().default("monthly"),
    /** 월 구독료(원) */
    amount: integer("amount").notNull(),
    /** 이 시점까지 시청 가능. 크론이 도달 시 다음 회차 청구 */
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    /** 무료기간 종료(=첫 유료청구) 예정일. §11.7 */
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    /** dunning 재시도 횟수 */
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscriptions_lead_idx").on(t.leadId),
    index("subscriptions_status_period_idx").on(t.status, t.currentPeriodEnd),
  ],
);

/**
 * 저장된 카드(toss 빌링키). 원클릭 업셀(OTO) 결제에 사용.
 * 주문서에서 카드 등록(requestBillingAuth) 시 발급 → lead 당 1개(최신).
 */
export const billingKeys = pgTable(
  "billing_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .references(() => leads.id)
      .notNull(),
    /** toss customerKey (= leadId 기반 무작위값) */
    customerKey: text("customer_key").notNull(),
    /** toss 빌링키 */
    billingKey: text("billing_key").notNull(),
    /** 표시용 마스킹 "신한 1234" */
    cardInfo: text("card_info"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("billing_keys_lead_idx").on(t.leadId)],
);

/** 래피드 웹훅 원본 로그 (서명검증 통과 여부 포함, 디버깅/CS 대응) */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().default("latpeed"),
  type: text("type"),
  status: text("status"),
  signatureValid: boolean("signature_valid").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 광고 플랫폼 일자별 지표 (Meta Marketing API insights). 크론이 upsert.
 * spend 는 광고 계정 통화 그대로(원 가정) 반올림 정수.
 */
export const adDailyStats = pgTable(
  "ad_daily_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD (광고 계정 타임존 기준) */
    date: text("date").notNull(),
    source: text("source").notNull().default("meta"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: integer("spend").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ad_daily_stats_key").on(t.campaignId, t.date, t.source),
    index("ad_daily_stats_date_idx").on(t.date),
  ],
);

/** 솔라피 발송 로그 (PRD 6.5) */
export const messageLogs = pgTable(
  "message_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    trigger: messageTrigger("trigger").notNull(),
    status: messageStatus("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 같은 트리거를 같은 리드에게 중복 발송하지 않도록
    uniqueIndex("message_logs_lead_trigger_idx").on(t.leadId, t.trigger),
  ],
);

/**
 * @deprecated P1 마이그레이션 소스. campaignPages 로 이관 후 제거 예정.
 * Puck 으로 편집하는 퍼널 페이지 (단계별 1개, 버전 관리)
 */
export const funnelPages = pgTable(
  "funnel_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** 'landing' | 'thankyou' | 'vod' | 'booking' */
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    published: boolean("published").notNull().default(false),
    /** Puck Data JSON */
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("funnel_pages_slug_idx").on(t.slug)],
);

/** 캠페인별 Puck 페이지 (캠페인 × page_type 당 여러 버전, 발행 1개) */
export const campaignPages = pgTable(
  "campaign_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    pageType: pageType("page_type").notNull(),
    /** A/B 변형. 'a' = 기본, 'b' = 두번째 변형 (landing 만 사용) */
    variant: text("variant").notNull().default("a"),
    version: integer("version").notNull().default(1),
    published: boolean("published").notNull().default(false),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaign_pages_lookup_idx").on(t.campaignId, t.pageType, t.variant),
    uniqueIndex("campaign_pages_version_idx").on(
      t.campaignId,
      t.pageType,
      t.variant,
      t.version,
    ),
  ],
);

/** 캠페인 ↔ 상품 매핑 (상품은 전역 풀, 캠페인이 노출 위치와 함께 연결) */
export const campaignProducts = pgTable(
  "campaign_products",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** 'thankyou' | 'vod_bottom' | 'both' */
    placement: text("placement").notNull().default("both"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("campaign_products_pk").on(t.campaignId, t.productId),
    index("campaign_products_campaign_idx").on(t.campaignId),
  ],
);

/** 캠페인별 문자 문구 오버라이드 (row 없으면 전역 automationTriggers 사용) */
export const campaignMessages = pgTable(
  "campaign_messages",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    trigger: messageTrigger("trigger").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    template: text("template").notNull().default(""),
    offsetHours: integer("offset_hours"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("campaign_messages_pk").on(t.campaignId, t.trigger)],
);

/** 자동화 트리거 설정 (PRD 6.5) — 사전정의 트리거의 On/Off·템플릿·발송시점만 관리 */
export const automationTriggers = pgTable("automation_triggers", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: messageTrigger("key").notNull().unique(),
  label: text("label").notNull(),
  condition: text("condition").notNull(),
  /** 시간 기반 트리거의 발송 오프셋(시간). 이벤트 기반이면 null */
  offsetHours: integer("offset_hours"),
  enabled: boolean("enabled").notNull().default(true),
  /** 솔라피 문자 본문 템플릿. 변수: {이름} {마감시각} {상품명} {링크} */
  template: text("template").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Follow-up 시퀀스 (러셀식 Soap Opera / Seinfeld).
 * automation_triggers(고정 트리거)는 그대로 두고, 그 위에 얹는 유연한 시퀀스.
 * ------------------------------------------------------------------ */

/** 리드를 시퀀스에 자동 등록하는 이벤트 */
export const sequenceEnrollEvent = pgEnum("sequence_enroll_event", [
  "signup", // 무료 신청(리드 생성)
  "purchase", // 결제 완료
  "booking", // 상담 예약 완료
  "manual", // 관리자가 직접 등록
]);

/** 각 스텝을 받을 대상 조건 */
export const sequenceAudience = pgEnum("sequence_audience", [
  "all", // 전원
  "not_purchased", // 아직 결제 안 한 사람만
  "not_booked", // 아직 상담 예약 안 한 사람만
  "not_watched", // 아직 강의 시청 안 한 사람만
]);

export const messageSequences = pgTable("message_sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** null = 전역(모든 캠페인) */
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  name: text("name").notNull(),
  enrollEvent: sequenceEnrollEvent("enroll_event").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => messageSequences.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    /** 등록 시점 기준 이 시간(시간 단위) 뒤에 발송 */
    delayHours: integer("delay_hours").notNull().default(0),
    audience: sequenceAudience("audience").notNull().default("all"),
    /** 솔라피 문자 본문. 변수: {이름}{링크}{예약링크}{결제링크}{상품명}{마감시각}{다운로드링크} */
    template: text("template").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [index("sequence_steps_seq_idx").on(t.sequenceId, t.stepOrder)],
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => messageSequences.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 'active' | 'done' | 'stopped' */
    status: text("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("sequence_enrollments_idx").on(t.sequenceId, t.leadId)],
);

/** 스텝별 발송 기록 (진행 상태 추적 = 이 테이블) */
export const sequenceSends = pgTable(
  "sequence_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").notNull(),
    /** 'sent' | 'failed' | 'skipped'(대상 조건 불일치) */
    status: text("status").notNull().default("sent"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sequence_sends_idx").on(t.enrollmentId, t.stepId)],
);

export type Lead = typeof leads.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AutomationTrigger = typeof automationTriggers.$inferSelect;
export type MessageSequence = typeof messageSequences.$inferSelect;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type SequenceEnrollEvent = (typeof sequenceEnrollEvent.enumValues)[number];
export type SequenceAudience = (typeof sequenceAudience.enumValues)[number];
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignPage = typeof campaignPages.$inferSelect;
export type PageType = (typeof pageType.enumValues)[number];
export type PendingOrder = typeof pendingOrders.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type BillingKey = typeof billingKeys.$inferSelect;
export type PaymentProvider = "latpeed" | "toss";
export type ProductKind = "one_time" | "membership";
