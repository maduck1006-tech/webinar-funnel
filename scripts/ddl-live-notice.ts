/**
 * 라이브 안내 발송 + 참석 추적 컬럼/테이블. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/ddl-live-notice.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.unsafe(`
    ALTER TABLE event_registrations
      ADD COLUMN IF NOT EXISTS token text,
      ADD COLUMN IF NOT EXISTS notified_at timestamptz,
      ADD COLUMN IF NOT EXISTS attended_at timestamptz,
      ADD COLUMN IF NOT EXISTS rsvp_at timestamptz;

    CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_token_idx
      ON event_registrations (token);

    CREATE TABLE IF NOT EXISTS event_notices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      kind text NOT NULL DEFAULT 'notice',
      memo text,
      body text NOT NULL,
      live_url text,
      sent_count integer NOT NULL DEFAULT 0,
      failed_count integer NOT NULL DEFAULT 0,
      dry_run boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS event_notices_event_idx
      ON event_notices (event_id, created_at);
  `);
  const [{ n }] = await sql`select count(*)::int n from event_notices`;
  console.log(`완료 — event_notices 행 ${n}`);
  await sql.end();
}
main();
