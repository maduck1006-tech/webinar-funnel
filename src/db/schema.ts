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
]);

export const messageTrigger = pgEnum("message_trigger", [
  "signup_confirm",
  "reminder_24h",
  "reminder_12h_left",
  "reminder_1h_left",
  "pre_payment_nudge",
  "payment_success",
  "payment_cancel_admin",
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
]);

/** 퍼널 페이지 종류 (캠페인마다 각 1개) */
export const pageType = pgEnum("page_type", [
  "landing",
  "thankyou",
  "vod",
  "booking",
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
    /** 광고 유입 추적 (PRD Open Q9) */
    utm: jsonb("utm").$type<Record<string, string>>(),
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
  /** 래피드 결제 페이지 URL 또는 상품 ID 매핑 */
  latpeedProductId: text("latpeed_product_id"),
  latpeedCheckoutUrl: text("latpeed_checkout_url"),
  /** 노출 위치: 'thankyou' | 'vod_bottom' | 'both' */
  placement: text("placement").notNull().default("both"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 래피드 웹훅으로 확정되는 주문 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    leadId: uuid("lead_id").references(() => leads.id),
    productId: uuid("product_id").references(() => products.id),
    latpeedOrderId: text("latpeed_order_id").notNull(),
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
  (t) => [uniqueIndex("orders_latpeed_order_id_idx").on(t.latpeedOrderId)],
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

export type Lead = typeof leads.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AutomationTrigger = typeof automationTriggers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignPage = typeof campaignPages.$inferSelect;
export type PageType = (typeof pageType.enumValues)[number];
