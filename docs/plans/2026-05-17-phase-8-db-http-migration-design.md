# Phase 8 — Cloudflare Hyperdrive for Production DB Connection

**Date:** 2026-05-17
**Status:** Approved (design phase; implementation plan to follow)
**Scope:** Fix recurring CF Workers 1101 errors by routing production Postgres traffic through Cloudflare Hyperdrive. Zero application-code changes; one binding addition + a 5-line runtime check in `src/db/index.ts`.

---

## 1. Context

After deploying Phase 1–7 to production, every refresh of `/admin/*` pages throws **Error 1101 — Worker threw exception**. CF Workers Observability logs confirm the cause: "The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response." The hang is `postgres-js` waiting on a TCP+TLS handshake to Supabase's transaction pooler in Singapore that either takes too long or gets dropped mid-request.

Four `postgres-js` config tweaks were attempted across the session (pooler URL switch, `prepare: false`, `fetch_types: false`, `max + idle_timeout` tuning) — each helped marginally but the architectural mismatch remains: **CF Workers are stateless; postgres-js assumes a persistent connection pool**. The next request to a freshly-spawned worker isolate pays the full handshake cost again.

### User decisions locked in before brainstorming

- Keep Drizzle ORM (zero call-site rewrites across 25 files using `@/db`).
- Production deploy works without 1101s on every request.
- 233 existing tests still pass.

### User decisions locked in during brainstorming

- **Cloudflare Hyperdrive** for production DB traffic. Drizzle + postgres-js stay unchanged; only the connection string source changes.
- Local dev keeps `process.env.DATABASE_URL` (Supabase pooler URL) — Hyperdrive is CF-Workers-only and unreachable from a laptop.
- Tests stay on `postgres-js` against the existing local DATABASE_URL path. Zero test changes.
- Hyperdrive's free tier is sufficient — single-gym scale (200–500 members → ~3,000–5,000 requests/day) is well within Workers Free (100K req/day). $0 expected forever.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Dashboard                                        │
│  Storage & Databases → Hyperdrive                            │
│                                                              │
│  Hyperdrive config "gym-db":                                 │
│    Type: PostgreSQL                                          │
│    Origin: Supabase transaction pooler                       │
│      (aws-1-ap-southeast-1.pooler.supabase.com:6543)         │
│    Read-only query caching: enabled (60s TTL)                │
│                                                              │
│  CF generates Hyperdrive ID: <uuid>                          │
└──────────────────────────────────────────────────────────────┘
                       │ bind to worker
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  wrangler.jsonc                                              │
│                                                              │
│  "hyperdrive": [                                             │
│    { "binding": "HYPERDRIVE", "id": "<uuid>" }               │
│  ]                                                            │
└──────────────────────────────────────────────────────────────┘
                       │ exposes env.HYPERDRIVE.connectionString
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  src/db/index.ts                                             │
│                                                              │
│  getConnectionString():                                      │
│    1. Try @opennextjs/cloudflare → env.HYPERDRIVE.connection │
│    2. Fall through to process.env.DATABASE_URL               │
│                                                              │
│  Drizzle + postgres-js setup: UNCHANGED                      │
└──────────────────────────────────────────────────────────────┘
                       │ Drizzle API unchanged
                       ▼
              every existing query call-site
                  (zero changes, 25 files)
```

**What Hyperdrive does behind the scenes:** maintains a persistent pool of warm Postgres connections inside Cloudflare's edge network, geographically near Supabase's Singapore region. When the worker asks for `env.HYPERDRIVE.connectionString`, it gets a "local" address that routes through CF's pooler. The TCP+TLS handshake to Singapore happens **once when Hyperdrive's pool warms up**, not on every worker invocation. Worker-to-Hyperdrive is intra-CF: single-digit milliseconds.

### 2.1 What changes

- `wrangler.jsonc` gains a `hyperdrive` binding array
- `src/db/index.ts` gets a `getConnectionString()` helper with 2-branch resolution
- One-time CF dashboard setup: create the Hyperdrive config, copy the ID

### 2.2 What doesn't change

- `src/db/schema.ts` — unchanged
- All 25 files importing `@/db` — Drizzle API surface identical
- All 233 tests — Vitest path stays on `process.env.DATABASE_URL`
- `drizzle.config.ts` — migrations still use direct Postgres URL
- `package.json` — no new deps; `postgres` stays
- The Supabase database itself — same project, same schema

---

## 3. Component contracts

### 3.1 `src/db/index.ts`

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Connection string resolution order:
 *  1. Cloudflare Hyperdrive binding (production on CF Workers)
 *     — set via wrangler.jsonc hyperdrive[].binding = "HYPERDRIVE"
 *     — accessed via getCloudflareContext().env.HYPERDRIVE.connectionString
 *
 *  2. process.env.DATABASE_URL (local dev, vitest, drizzle-kit)
 *
 * Hyperdrive maintains warm Postgres connections inside Cloudflare's edge
 * network, eliminating the TCP/TLS handshake cost per worker invocation.
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

const client = postgres(getConnectionString(), {
  prepare: false,
  fetch_types: false,
  max: 5,
});

export const db = drizzle(client, { schema });
```

The `require` is intentional — `@opennextjs/cloudflare` exists only at runtime in the CF Worker bundle, not in test/dev. Static `import` would error at module load in vitest.

### 3.2 `wrangler.jsonc`

Add the `hyperdrive` block alongside existing fields:

```jsonc
{
  // ...existing fields unchanged...
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<paste-from-CF-dashboard>"
    }
  ]
}
```

### 3.3 Hyperdrive setup (CF dashboard, one-time)

1. CF Dashboard → Workers & Pages → **Storage & Databases** → **Hyperdrive**
2. **Create configuration**
3. Name: `gym-db`
4. Database type: PostgreSQL
5. Connection string: paste Supabase transaction-pooler URL (with password)
6. Caching: default (enabled, 60s TTL)
7. Click **Create**, copy the Hyperdrive ID
8. Paste ID into `wrangler.jsonc`

### 3.4 (Optional) TypeScript ambient declaration

To get type-safety on `env.HYPERDRIVE.connectionString`, add or extend `src/cloudflare-env.d.ts`:

```ts
declare global {
  interface CloudflareEnv {
    HYPERDRIVE: Hyperdrive;
  }
}
interface Hyperdrive {
  connectionString: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
export {};
```

Skipped in the minimal implementation; the try/catch + optional chaining handles it without the type.

---

## 4. Data flow

### 4.1 Production (CF Worker)

```
Worker invocation begins
   │
   ▼ on module load (cold start only)
import { db } from "@/db"
   │
   ▼
getConnectionString():
   require("@opennextjs/cloudflare") succeeds
   env.HYPERDRIVE.connectionString returns
     "postgres://...local-pool-address..."
   │
   ▼
postgres(connStr, { prepare: false, fetch_types: false, max: 5 })
   │
   ▼ first query
db.select().from(profiles).where(...)
   │
   ▼
postgres-js opens a connection to the local pool address
(intra-CF; single-digit ms)
   │
   ▼
Hyperdrive routes to a warm Postgres connection in its pool
(connection-to-Singapore already established)
   │
   ▼
query executes → rows return
   │
   ▼ < 50ms total (vs 1-3s direct)
typed rows returned to caller
```

**The key win:** the TCP+TLS handshake to Singapore happens **inside Hyperdrive's pool**, not on every cold worker boot.

### 4.2 Local dev / vitest

```
Module load
   │
   ▼
getConnectionString():
   require("@opennextjs/cloudflare") throws (not in CF runtime)
   catch → fall through
   process.env.DATABASE_URL → Supabase transaction pooler URL
   │
   ▼
postgres(...) → drizzle(...) → db
```

Existing flow. Unchanged.

### 4.3 Drizzle migrations (`npm run db:push`)

Drizzle-kit reads `drizzle.config.ts` and uses `process.env.DIRECT_DATABASE_URL` (direct connection, port 5432). Bypasses both Hyperdrive and the pooler. No change.

### 4.4 Cron-triggered routes

Same path as a normal request. The `scheduled()` dispatcher internal-fetches `/api/cron/*` URLs, which run as regular worker invocations reading from Hyperdrive.

### 4.5 Caching behavior

Hyperdrive's read-cache stores results of read-only `SELECT` queries with a default 60s TTL. Means:

- Dashboard stat cards may lag up to 60s behind a fresh write (e.g., recording a payment)
- Acceptable for gym ops
- Can be disabled in CF dashboard if it ever causes confusion

---

## 5. Error handling

| Failure | Handling |
|---|---|
| Hyperdrive binding not configured in `wrangler.jsonc` | `env.HYPERDRIVE` undefined → falls through to `process.env.DATABASE_URL`. Worker still works (slower, direct connection). |
| `@opennextjs/cloudflare` require throws (test/dev/node) | try/catch swallows; falls through to `process.env.DATABASE_URL`. Existing flow. |
| Both Hyperdrive and `DATABASE_URL` missing | `throw new Error("DATABASE_URL is not set")`. Module load fails loudly with clear message. |
| Hyperdrive cache returns stale data (≤60s) | None — by design. Disable in CF dashboard if problematic. |
| Supabase Postgres down | Hyperdrive pool exhausts; postgres-js throws; Drizzle propagates; route returns 500. Same as before. |
| Hyperdrive service outage on CF side | Connection times out; Drizzle throws. Rare. Recovery: comment out `hyperdrive` block in `wrangler.jsonc`, redeploy → falls back to direct path. |
| Connection string format mismatch | postgres-js rejects on first query; easy to diagnose. |
| Migrations target wrong DB | Drizzle-kit reads `DIRECT_DATABASE_URL`, never Hyperdrive. Setup unchanged. |

### 5.1 No new error states introduced

Every failure mode either existed before, has a graceful fallback, or is identical to current production behavior. The migration cannot make production worse than it currently is.

### 5.2 What we explicitly do not handle

- Cache invalidation (Hyperdrive's 60s TTL is eventually consistent)
- Per-customer rate limiting (free tier has none at our scale)
- Multi-region failover (if Singapore goes down, no fallback — same as today)

---

## 6. Testing

### 6.1 Automated tests — zero new

The 233 existing tests use `process.env.DATABASE_URL` (set in `.env.local`). After the migration:

- They keep using that path because `require("@opennextjs/cloudflare")` throws in vitest → falls through
- No mock needed; no setup changes
- Run `npm test`, expect `Tests 233 passed (233)`

### 6.2 Why no unit test for `getConnectionString()`

Two branches:
- CF Worker path — can't be tested in vitest (no CF runtime)
- `process.env` path — exercised implicitly by every existing DB-touching test

Mocking `@opennextjs/cloudflare` would test the mock, not the real behavior. Skip.

### 6.3 Production smoke test (manual)

The real validation. After deploy, exercise the exact failure mode that's been broken:

1. Hard-reload `/admin` → loads ✓
2. Click sidebar → Members → loads ✓
3. Click → Pending → loads ✓
4. Click → Plans → loads ✓
5. Click → Reports → loads ✓
6. Click → Dashboard → loads ✓
7. Hard-reload 5 times at different pages → all load ✓
8. Wait 30s, reload → loads ✓ (was the failure: cold start after idle)
9. Wait 5 min, reload → loads ✓ (deeper cold start)

If all pass, the 1101 + connection-closed problems are fixed.

### 6.4 Cache-behavior check (optional)

1. Note `Total revenue` on dashboard
2. Record a cash payment via `/admin/members/[id]`
3. Reload dashboard immediately → may still show old value (cache)
4. Wait 60s, reload → stat updates

Acceptable for gym ops. If unacceptable, disable read caching in Hyperdrive config.

### 6.5 Pre-deploy gates

- `npm test` → 233/233
- `npm run build` → green
- `npm run cf:build` → green

### 6.6 Coverage target

Stays at 233 tests across 47 files. No deltas.

---

## 7. Done criteria

1. New Hyperdrive config created in CF dashboard.
2. `wrangler.jsonc` hyperdrive binding added with correct ID.
3. `src/db/index.ts` rewritten with `getConnectionString()`.
4. All 233 existing tests pass locally.
5. `npm run build` + `npm run cf:build` green.
6. `npx wrangler deploy` succeeds.
7. Production smoke test (§6.3) all 9 steps pass.
8. Tag `phase-8` at the green HEAD.

---

## 8. What's deferred

- **Migrating off Supabase** — staying on Supabase as the Postgres host; only the connection path changes.
- **Hyperdrive caching tuning** — accepting the 60s read-cache default; tune later if needed.
- **Multi-region failover** — single-region only (Singapore).
- **Type-safe `env.HYPERDRIVE` binding** — `try/catch + optional chaining` covers the runtime safely; ambient type declaration optional polish.
- **Observability dashboard** — relying on existing CF Workers Observability for monitoring.
- **Removing the `process.env.DATABASE_URL` path from production worker** — keeping the fallback so a broken Hyperdrive config doesn't take production fully offline.
