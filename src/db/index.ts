import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// CF Workers + Supabase transaction pooler:
// - `prepare: false` — pgbouncer transaction mode doesn't support prepared statements
// - `fetch_types: false` — skip the prepared-statement type lookup at startup;
//   the pooler in transaction mode rejects it and the auto-retry adds ~1s latency
// - `max: 5` — small pool; CF Workers isolates may reuse connections across requests
const client = postgres(connectionString, {
  prepare: false,
  fetch_types: false,
  max: 5,
});
export const db = drizzle(client, { schema });
