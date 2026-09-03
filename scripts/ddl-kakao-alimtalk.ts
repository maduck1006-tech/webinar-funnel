/**
 * 카카오 알림톡: 템플릿 저장소 + 자동 메시지 스텝의 채널 컬럼. (1회성, 재실행 안전)
 *   npx tsx --env-file=.env.local scripts/ddl-kakao-alimtalk.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS kakao_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      solapi_template_id text NOT NULL,
      channel_id text NOT NULL,
      name text NOT NULL,
      content text NOT NULL,
      header text,
      status text NOT NULL DEFAULT 'PENDING',
      variables jsonb NOT NULL DEFAULT '[]'::jsonb,
      buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
      synced_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS kakao_templates_solapi_id_idx
      ON kakao_templates (solapi_template_id);

    ALTER TABLE message_automation_steps
      ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms',
      ADD COLUMN IF NOT EXISTS kakao_template_id uuid,
      ADD COLUMN IF NOT EXISTS kakao_variable_map jsonb;
  `);
  const [{ n }] = await sql`select count(*)::int n from kakao_templates`;
  console.log(`완료 — kakao_templates 행 ${n}`);
  await sql.end();
}
main();
