import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Connection string resolution order:
 *  1. Cloudflare Hyperdrive binding (production CF Worker)
 *     — declared in wrangler.jsonc as hyperdrive[].binding = "HYPERDRIVE"
 *     — accessed via getCloudflareContext().env.HYPERDRIVE.connectionString
 *     Hyperdrive maintains warm Postgres connections inside CF's edge
 *     network, eliminating the TCP/TLS handshake cost per worker invocation.
 *
 *  2. process.env.DATABASE_URL (local dev, vitest, drizzle-kit)
 *
 * The require() is intentional — `@opennextjs/cloudflare` only exists at
 * runtime in the CF Worker bundle, not in test/dev. A static import would
 * fail to load in vitest.
 */
function getConnectionString(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const env = getCloudflareContext()?.env;
    if (env?.HYPERDRIVE?.connectionString) {
      return env.HYPERDRIVE.connectionString;
    }
  } catch {
    // not in a CF Worker context — fall through to process.env
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

// CF Workers + Supabase transaction pooler:
// - `prepare: false` — pgbouncer transaction mode doesn't support prepared statements
// - `fetch_types: false` — skip the prepared-statement type lookup at startup
// - `max: 5` — small pool; CF Workers isolates may reuse connections across requests
const client = postgres(getConnectionString(), {
  prepare: false,
  fetch_types: false,
  max: 5,
});

export const db = drizzle(client, { schema });
