import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// CF Workers + Supabase transaction pooler:
// - `prepare: false` — pgbouncer transaction mode doesn't support prepared statements
// - `max: 1` — each worker invocation is short-lived; no point pooling
// - `idle_timeout: 20` — close the connection 20s after last query so a stale
//   socket can't linger across invocations
// - `connect_timeout: 10` — fail fast if the pooler is unreachable
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });
