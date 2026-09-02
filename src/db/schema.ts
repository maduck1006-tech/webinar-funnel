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
  // 종착 스텝: 무료 단톡방(오픈카톡) 입장 안내 (docs/multi-product-funnel-plan.md P0′)
  "groupchat",
  // 유료 상품(전자책/강의/상담) 세일즈레터 + 다운로드 전달 (docs/multi-product-funnel-plan.md P1)
  "sales",
  "delivery",
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
    /** 생성 시 쓴 퍼널 템플릿 키 (설정 체크리스트용) src/lib/funnel-templates.ts */
    templateKey: text("template_key"),
    /** 랜딩 A/B 테스트 진행 중 (variant a/b 50:50 분배) */
    abLanding: boolean("ab_landing").notNull().default(false),

    /**
     * 퍼널 종류 (docs/multi-product-funnel-plan.md §1)
     * 'evergreen_webinar' | 'live_webinar_reg' | 'vod_course' | 'ebook' | 'paid_consult'
     */
    funnelType: text("funnel_type").notNull().default("evergreen_webinar"),
    /**
     * 웨비나형 퍼널의 종착 스텝 (docs/multi-product-funnel-plan.md P0′)
     * 'booking'(1:1 예약) | 'groupchat'(무료 단톡방) | 'sales'(유료 세일즈)
     */
    terminalStep: text("terminal_step").notNull().default("booking"),
    /** 종착이 groupchat 일 때 안내할 오픈카톡 등 단톡방 초대 링크 */
    groupChatUrl: text("group_chat_url"),
    /**
     * 이 캠페인 퍼널의 단계 구성 (순서 + 사용여부). 없으면 funnel_type 프리셋 사용.
     * (docs/multi-product-funnel-plan.md Phase A) src/lib/funnel-flow.ts
     */
    flow: jsonb("flow").$type<{ steps: { pageType: string; enabled: boolean }[] }>(),

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
    /** 엔드유저 로그인(휴대폰 OTP) 후 연결되는 계정 (docs/multi-product-funnel-plan.md 로그인) */
    userId: uuid("user_id"),
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

/* ------------------------------------------------------------------ *
 * 엔드유저 계정 — 휴대폰 OTP 로그인 (docs/multi-product-funnel-plan.md)
 * users.phone(정규화 01012345678) 로 기존 leads 매칭 → /library
 * ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phone: text("phone").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_sessions_user_idx").on(t.userId)],
);

/** 발송한 인증번호 (해시 저장). 검증 성공/만료 시 삭제 */
export const phoneOtps = pgTable(
  "phone_otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("phone_otps_phone_idx").on(t.phone, t.createdAt)],
);

/**
 * 브로드캐스트 — 세그먼트에 한 번 쏘는 문자 (자동 드립 아님).
 * 브런슨: 자동화=신규용, 브로드캐스트=리스트를 계속 데우는 것.
 * (docs/multi-product-funnel-plan.md 보완 1 · 브로드캐스트)
 */
export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  /** 대상 조건 (src/lib/broadcasts.ts resolveSegment) */
  segment: jsonb("segment").$type<Record<string, unknown>>().notNull().default({}),
  /** null = 즉시 발송, 값 있으면 그 시각에 크론이 발송 */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /** 'draft' | 'scheduled' | 'sending' | 'sent' */
  status: text("status").notNull().default("draft"),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const broadcastSends = pgTable(
  "broadcast_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    status: text("status").notNull().default("sent"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("broadcast_sends_idx").on(t.broadcastId, t.leadId)],
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
  /**
   * 상품 타입 — "결제 후 무엇을 주는가" (docs/multi-product-funnel-plan.md §4-2)
   * 'workbook' | 'vod_course' | 'ebook' | 'coaching' | 'membership'
   */
  type: text("type").notNull().default("workbook"),
  /** 전달 설정. ebook: {assetUrl,previewUrl?} · coaching: {bookingEmbedUrl,sessions} */
  delivery: jsonb("delivery").$type<Record<string, unknown>>(),
  /** 열람/수강 기한(일). null = 무제한 */
  accessDays: integer("access_days"),
  /** 가격 모드: 'paid' | 'free' | 'pwyw' (무료면 체크아웃 스킵) */
  priceMode: text("price_mode").notNull().default("paid"),
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
  /**
   * 번들: 이 값이 있으면 이 상품 구매 시 포함된 상품들의 엔타이틀먼트도 함께 부여.
   * (docs/multi-product-funnel-plan.md 크로스셀/번들)
   */
  bundleProductIds: jsonb("bundle_product_ids").$type<string[]>(),
  /** 크로스셀: 이 상품 구매자에게 다음 단계로 제안할 상품 (/library 상단 노출) */
  nextOfferId: uuid("next_offer_id"),
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
    /** 적용된 쿠폰 + 할인액(원). amount 는 이미 차감된 실결제액 */
    couponId: uuid("coupon_id"),
    discount: integer("discount").notNull().default(0),
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
 * 엔타이틀먼트 — "이 리드가 이 상품에 접근 권한 있음"의 단일 원장.
 * (docs/multi-product-funnel-plan.md §4-3)
 * 부여: /api/toss/confirm 결제확정 · 무료 opt-in · 관리자 수동.
 * 게이트: 강의실/다운로드/유료상담 뷰가 hasEntitlement 로 확인.
 */
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    /** 매직링크 인증 도입 후 채움 (현재는 lead 기준) */
    userId: uuid("user_id"),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** 무료옵트인/수동부여면 null */
    sourceOrderId: uuid("source_order_id").references(() => orders.id),
    /** 'course' | 'ebook' | 'coaching' | 'membership' */
    kind: text("kind").notNull(),
    /** 'active' | 'revoked' | 'expired' */
    status: text("status").notNull().default("active"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** product.access_days 로 계산. null = 평생 */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("entitlements_lead_product_idx").on(t.leadId, t.productId),
    index("entitlements_lead_idx").on(t.leadId),
    index("entitlements_product_status_idx").on(t.productId, t.status),
  ],
);

/**
 * VOD 강의 (product.type='vod_course' 1:1). 영상은 유튜브 일부공개(unlisted) 임베드.
 * (docs/multi-product-funnel-plan.md P2)
 */
export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const courseModules = pgTable(
  "course_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title").notNull(),
  },
  (t) => [index("course_modules_course_idx").on(t.courseId, t.sortOrder)],
);

export const courseLessons = pgTable(
  "course_lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    title: text("title").notNull(),
    /** 'youtube' 고정(P2) — 향후 mux/vimeo/blob 확장 여지 */
    videoProvider: text("video_provider").notNull().default("youtube"),
    /** 유튜브 영상 ID(11자) 또는 전체 URL */
    videoRef: text("video_ref").notNull().default(""),
    durationSec: integer("duration_sec"),
    /** 비구매자에게도 공개(맛보기) */
    isPreview: boolean("is_preview").notNull().default(false),
    /** 엔타이틀먼트 부여일 + N일 후 오픈. 0 = 즉시 */
    dripDays: integer("drip_days").notNull().default(0),
  },
  (t) => [index("course_lessons_module_idx").on(t.moduleId, t.sortOrder)],
);

/**
 * 라이브 웨비나 신청 퍼널의 회차 (docs/multi-product-funnel-plan.md P3)
 * 방송은 외부(유튜브 라이브)에서 진행 — 이 앱은 신청·리마인더·리플레이 전환만 담당.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Seoul"),
    durationMin: integer("duration_min").notNull().default(60),
    /** 유튜브 라이브 등 외부 시청 URL */
    externalLiveUrl: text("external_live_url"),
    /** 종료 후 올릴 리플레이 영상. 없으면 campaign.vodSrc 사용 */
    replayUrl: text("replay_url"),
    /** 리플레이 공개(=startsAt+durationMin) 후 시청 가능 기간(시간) */
    replayWindowHours: integer("replay_window_hours").notNull().default(48),
    /** 'scheduled' | 'ended' | 'canceled' */
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_campaign_starts_idx").on(t.campaignId, t.startsAt)],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 사전 리마인더(24h/1h 전) 중복발송 방지 플래그 — 크론이 daily 자동화 엔진 밖에서 직접 관리 */
    remindedD1: boolean("reminded_d1").notNull().default(false),
    remindedH1: boolean("reminded_h1").notNull().default(false),
  },
  (t) => [
    uniqueIndex("event_registrations_event_lead_idx").on(t.eventId, t.leadId),
    index("event_registrations_lead_idx").on(t.leadId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => courseLessons.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("lesson_progress_lead_lesson_idx").on(t.leadId, t.lessonId)],
);

/**
 * 할인 쿠폰 (docs/multi-product-funnel-plan.md P4 · 크로스셀/번들과 함께)
 * code 로 식별. percent(1~100) 또는 fixed(원). 검증은 src/lib/coupons.ts
 */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name"),
    /** 'percent' | 'fixed' */
    type: text("type").notNull().default("percent"),
    /** percent: 1~100 · fixed: 원 */
    value: integer("value").notNull(),
    active: boolean("active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** 전체 사용 한도 (null = 무제한) */
    maxRedemptions: integer("max_redemptions"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    /** 최소 주문 금액 (null = 없음) */
    minAmount: integer("min_amount"),
    /**
     * 개인별 마감(Deadline Funnel): 값이 있으면 각 리드의 신청시각 + N시간 뒤 만료.
     * 진짜 마감 — 지나면 이 쿠폰은 무효(정가 결제). (docs/multi-product-funnel-plan.md 보완 4)
     */
    leadWindowHours: integer("lead_window_hours"),
    /** 적용 대상 상품 id 목록 (null/빈배열 = 전체) */
    productIds: jsonb("product_ids").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("coupons_code_idx").on(t.code)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id),
    orderId: uuid("order_id").references(() => orders.id),
    discount: integer("discount").notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coupon_redemptions_coupon_idx").on(t.couponId),
    index("coupon_redemptions_lead_idx").on(t.leadId),
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
  /** 적용된 쿠폰 (confirm 성공 시 redeem) */
  couponId: uuid("coupon_id"),
  /** 쿠폰 할인액(원). amount 는 이미 차감된 값 */
  discount: integer("discount").notNull().default(0),
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
 * 자동 메시지 (통합) — docs/messaging-unification-plan.md
 * "고정 트리거"와 "시퀀스"를 하나로. 모든 CRM 문자 =
 *   {시작 이벤트(trigger)} + {N분 뒤(delay)} + {대상 조건(audience)} + {본문}
 * ------------------------------------------------------------------ */

/** 자동 메시지를 시작시키는 이벤트 (지연 계산의 기준 시각 = anchor) */
export const messageAutomationTrigger = pgEnum("message_automation_trigger", [
  "signup", // 무료 신청 (anchor: leads.createdAt)
  "watch_start", // 강의 시청 시작 (anchor: leads.firstWatchedAt)
  "purchase", // 결제 완료 (anchor: order.paidAt)
  "booking", // 상담 예약 확정 (anchor: 예약시각)
  "manual", // 관리자가 CRM 에서 직접 등록 (anchor: now)
  "cart_abandon", // 결제창까지 갔다가 이탈 (anchor: pending_order.createdAt) — cron 이 enroll

  // 라이브 웨비나 신청 완료 (anchor: event.startsAt — 사전 리마인더는 이 트리거가 아니라
  // lib/events.ts sendEventPreReminders 가 별도 처리. 여기 스텝은 startsAt 이후(양수 지연)만 사용:
  // 리플레이 공개·마감임박 등 (docs/multi-product-funnel-plan.md P3)
  "event_registered",
]);

/** 각 스텝을 받을 대상 조건 */
export const messageAudience = pgEnum("message_audience", [
  "all",
  "not_watched", // 아직 강의 시청 안 함
  "not_purchased", // 아직 결제 안 함
  "not_booked", // 아직 상담 예약 안 함
]);
/**
 * message_audience 에 값 추가 시 src/lib/messaging.ts audienceMatches 도 갱신 필요.
 * 현재 지원: all / not_watched / not_purchased / not_booked
 */

export const messageAutomations = pgTable(
  "message_automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** null = 전역 기본(모든 캠페인 상속) | uuid = 캠페인 전용 */
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    /** null = 사용자 생성 | 'signup_confirm' 등 = 시스템 기본 식별자 */
    key: text("key"),
    name: text("name").notNull(),
    trigger: messageAutomationTrigger("trigger").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** 이 이벤트들이 발생하면 이 자동화의 active enrollment 를 stopped 로. 예: ["purchase","booking"] */
    stopOn: jsonb("stop_on").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("message_automations_lookup_idx").on(t.campaignId, t.trigger),
    index("message_automations_key_idx").on(t.campaignId, t.key),
  ],
);

export const messageAutomationSteps = pgTable(
  "message_automation_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => messageAutomations.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    /** trigger(anchor) 시점 기준 이 분(minute) 뒤에 발송. 0 = 즉시 */
    delayMinutes: integer("delay_minutes").notNull().default(0),
    audience: messageAudience("audience").notNull().default("all"),
    /** 솔라피 문자 본문. 변수: {이름}{링크}{예약링크}{결제링크}{상품명}{마감시각}{다운로드링크} */
    body: text("body").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [
    index("message_automation_steps_idx").on(t.automationId, t.stepOrder),
  ],
);

export const messageAutomationEnrollments = pgTable(
  "message_automation_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => messageAutomations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    /** 지연 계산 기준 시각 (= trigger 발생 시각) */
    anchorAt: timestamp("anchor_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** 'active' | 'done' | 'stopped' */
    status: text("status").notNull().default("active"),
  },
  (t) => [
    uniqueIndex("message_automation_enrollments_idx").on(
      t.automationId,
      t.leadId,
    ),
    index("message_automation_enrollments_status_idx").on(t.status),
  ],
);

/** 문자 발송 기록 (message_logs 대체 · 진행 상태 추적) */
export const messageSends = pgTable(
  "message_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    stepId: uuid("step_id")
      .notNull()
      .references(() => messageAutomationSteps.id, { onDelete: "cascade" }),
    /** 'sent' | 'failed' | 'skipped'(대상 조건 불일치) */
    status: text("status").notNull().default("sent"),
    channel: text("channel").notNull().default("sms"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("message_sends_idx").on(t.leadId, t.stepId)],
);

export type Lead = typeof leads.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AutomationTrigger = typeof automationTriggers.$inferSelect;
export type MessageAutomation = typeof messageAutomations.$inferSelect;
export type MessageAutomationStep = typeof messageAutomationSteps.$inferSelect;
export type MessageAutomationTrigger =
  (typeof messageAutomationTrigger.enumValues)[number];
export type MessageAudience = (typeof messageAudience.enumValues)[number];
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignPage = typeof campaignPages.$inferSelect;
export type PageType = (typeof pageType.enumValues)[number];
export type PendingOrder = typeof pendingOrders.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
export type User = typeof users.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type CourseModule = typeof courseModules.$inferSelect;
export type CourseLesson = typeof courseLessons.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type BillingKey = typeof billingKeys.$inferSelect;
export type PaymentProvider = "latpeed" | "toss";
export type ProductKind = "one_time" | "membership";
