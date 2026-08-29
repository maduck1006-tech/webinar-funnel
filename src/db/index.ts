import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 빌드/개발 편의상 미설정이어도 import 는 통과시키고, 실제 쿼리 시점에 실패하게 둔다.
const connectionString =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/_unset";

// 서버리스에서 커넥션 폭증 방지: prepare 비활성 + 개발 시 전역 재사용
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb._pgClient ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb._pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
