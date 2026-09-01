/**
 * 자동 메시지 통합 스키마 DDL (drizzle-kit push 의 인터랙티브 프롬프트 우회).
 *   npx tsx --env-file=.env.local scripts/ddl-messaging.ts
 * 재실행 안전 (IF EXISTS / IF NOT EXISTS).
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.begin(async (tx) => {
    // 구 시퀀스 테이블/enum 제거 (데이터 없음)
    await tx.unsafe(`DROP TABLE IF EXISTS sequence_sends CASCADE`);
    await tx.unsafe(`DROP TABLE IF EXISTS sequence_enrollments CASCADE`);
    await tx.unsafe(`DROP TABLE IF EXISTS sequence_steps CASCADE`);
    await tx.unsafe(`DROP TABLE IF EXISTS message_sequences CASCADE`);
    await tx.unsafe(`DROP TYPE IF EXISTS sequence_enroll_event`);
    await tx.unsafe(`DROP TYPE IF EXISTS sequence_audience`);

    await tx.unsafe(`
      DO $$ BEGIN
        CREATE TYPE message_automation_trigger AS ENUM ('signup','watch_start','purchase','booking','manual');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await tx.unsafe(`
      DO $$ BEGIN
        CREATE TYPE message_audience AS ENUM ('all','not_watched','not_purchased','not_booked');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS message_automations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid REFERENCES campaigns(id),
        key text,
        name text NOT NULL,
        trigger message_automation_trigger NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        stop_on jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.unsafe(
      `CREATE INDEX IF NOT EXISTS message_automations_lookup_idx ON message_automations (campaign_id, trigger)`,
    );
    await tx.unsafe(
      `CREATE INDEX IF NOT EXISTS message_automations_key_idx ON message_automations (campaign_id, key)`,
    );

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS message_automation_steps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id uuid NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
        step_order integer NOT NULL,
        delay_minutes integer NOT NULL DEFAULT 0,
        audience message_audience NOT NULL DEFAULT 'all',
        body text NOT NULL DEFAULT '',
        enabled boolean NOT NULL DEFAULT true
      )
    `);
    await tx.unsafe(
      `CREATE INDEX IF NOT EXISTS message_automation_steps_idx ON message_automation_steps (automation_id, step_order)`,
    );

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS message_automation_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id uuid NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES leads(id),
        anchor_at timestamptz NOT NULL DEFAULT now(),
        status text NOT NULL DEFAULT 'active'
      )
    `);
    await tx.unsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS message_automation_enrollments_idx ON message_automation_enrollments (automation_id, lead_id)`,
    );
    await tx.unsafe(
      `CREATE INDEX IF NOT EXISTS message_automation_enrollments_status_idx ON message_automation_enrollments (status)`,
    );

    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS message_sends (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id uuid NOT NULL REFERENCES leads(id),
        step_id uuid NOT NULL REFERENCES message_automation_steps(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'sent',
        channel text NOT NULL DEFAULT 'sms',
        provider_message_id text,
        error text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.unsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS message_sends_idx ON message_sends (lead_id, step_id)`,
    );
  });

  console.log("✅ 자동 메시지 스키마 적용 완료");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
