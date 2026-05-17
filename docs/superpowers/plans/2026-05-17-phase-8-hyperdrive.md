# Phase 8 — Cloudflare Hyperdrive for Production DB Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the production worker's Postgres traffic through Cloudflare Hyperdrive to eliminate the recurring 1101 errors caused by postgres-js cold-start handshakes to Supabase's pooler.

**Architecture:** Three changes only. (1) One-time Hyperdrive config in CF dashboard (user does this in the browser). (2) Add a `hyperdrive` binding to `wrangler.jsonc`. (3) Rewrite `src/db/index.ts` with a `getConnectionString()` helper that reads from `env.HYPERDRIVE.connectionString` in CF Workers and falls through to `process.env.DATABASE_URL` everywhere else. Drizzle, postgres-js, schema, and every existing query call-site stay unchanged.

**Tech Stack:** Same as prior phases — Next.js 15 + Drizzle + Supabase + CF Workers via OpenNext, Vitest 4. Plus **Cloudflare Hyperdrive** (free tier, included with Workers Free).

**Reference design:** `docs/plans/2026-05-17-phase-8-db-http-migration-design.md` (committed `1215004`).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell** (commands also work in bash where noted).
- Every code-touching task ends with one `git commit`.
- Manual CF dashboard task (Task 1) ends with the user pasting back the Hyperdrive ID.
- No new test files. The 233 existing tests must stay green.

---

## File structure (new and modified)

```
src/db/index.ts                    (REWRITE — Task 3, ~30 lines)
wrangler.jsonc                     (MODIFY — Task 2, add 6 lines)

docs/plans/...                     (already committed in `1215004`)
```

Zero new files. Zero new dependencies.

---

## Task 0: Baseline check

**Why:** Confirm the 233 existing tests pass and the codebase is at the expected commit before touching the DB layer. Any regression after this baseline is something Phase 8 caused.

- [ ] **Step 1: Confirm current commit**

  ```powershell
  git log -1 --oneline
  ```

  Expected: `1215004 docs: phase 8 (Cloudflare Hyperdrive) design` (or a later commit if more docs landed). If you see an older commit, you're not on the right baseline — investigate.

- [ ] **Step 2: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: `Tests  233 passed (233)` across 47 files. If the count differs, stop and investigate.

- [ ] **Step 3: Verify the local build works**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 4: No commit — baseline only.**

---

## Task 1: Create the Hyperdrive configuration in the Cloudflare dashboard

**Why:** Hyperdrive is provisioned through the CF dashboard, not via Wrangler CLI (well, technically wrangler can, but the dashboard is faster + visual). Once created, it gives us an ID that we paste into `wrangler.jsonc` in Task 2. **This task is user-driven — no code changes here.**

**Files:**
- (none — all manual UI steps)

- [ ] **Step 1: Open the Cloudflare dashboard**

  Browser: https://dash.cloudflare.com

- [ ] **Step 2: Navigate to Hyperdrive**

  Left sidebar → **Storage & Databases** → **Hyperdrive**

  If "Storage & Databases" isn't visible, scroll the sidebar — the menu has many items.

- [ ] **Step 3: Click "Create configuration"**

  A form opens.

- [ ] **Step 4: Fill in the form**

  - **Name:** `gym-db`
  - **Database type:** PostgreSQL (default)
  - **Connection string:** paste the full Supabase transaction-pooler URL (with the real password substituted). Format:

    ```
    postgresql://postgres.dybiojmzrxjndeszrxhn:<password>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres
    ```

    Pull this exact value from CF Dashboard → Workers → muscle-factory-gym → Settings → Variables and Secrets → `DATABASE_URL`. Copy that value verbatim.

  - **Caching:** leave at default (Enabled, 60s TTL). The dashboard surfaces this as "Caching mode: caching enabled" or similar. Don't change it.

- [ ] **Step 5: Click "Create"**

  CF provisions the Hyperdrive config. Takes a few seconds.

- [ ] **Step 6: Copy the Hyperdrive ID**

  After creation, the new config page shows an ID at the top — looks like a UUID (e.g. `7b2a5e4c-3d8f-4a2b-91c7-d9e8f0b1a2c3`). **Copy this value.** You'll paste it into `wrangler.jsonc` in Task 2.

- [ ] **Step 7: No commit — only the manual dashboard work is done in this task.**

**Important:** Paste the Hyperdrive ID into your terminal / a notepad / wherever you can grab it from in Task 2. If you lose it, you can always come back to the CF dashboard → Hyperdrive → `gym-db` → it's shown at the top.

---

## Task 2: Add the Hyperdrive binding to `wrangler.jsonc`

**Why:** The binding tells the CF Workers runtime to expose Hyperdrive at `env.HYPERDRIVE` when the worker runs. Without this entry, the binding doesn't exist and the worker falls back to `process.env.DATABASE_URL` (which is exactly the broken path we're fixing).

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Open `wrangler.jsonc`**

  The current content (verified at the start of this phase):

  ```jsonc
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "muscle-factory-gym",
    "main": "src/worker-with-scheduled.ts",
    "compatibility_date": "2025-12-01",
    "compatibility_flags": ["nodejs_compat"],
    "assets": {
      "directory": ".open-next/assets",
      "binding": "ASSETS",
      "run_worker_first": true
    },
    "observability": {
      "enabled": true
    },
    "triggers": {
      "crons": [
        "30 18 * * *",
        "0 19 * * *",
        "30 1 * * *",
        "0 * * * *"
      ]
    },
    "vars": {
      "WORKER_HOSTNAME": "muscle-factory-gym.kha-akashanadeel.workers.dev"
    }
  }
  ```

- [ ] **Step 2: Add the `hyperdrive` block**

  Insert a top-level `"hyperdrive"` array. The final file should look like (replacing `<paste-your-id-here>` with the actual UUID from Task 1):

  ```jsonc
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "muscle-factory-gym",
    "main": "src/worker-with-scheduled.ts",
    "compatibility_date": "2025-12-01",
    "compatibility_flags": ["nodejs_compat"],
    "assets": {
      "directory": ".open-next/assets",
      "binding": "ASSETS",
      "run_worker_first": true
    },
    "observability": {
      "enabled": true
    },
    "triggers": {
      "crons": [
        "30 18 * * *",
        "0 19 * * *",
        "30 1 * * *",
        "0 * * * *"
      ]
    },
    "vars": {
      "WORKER_HOSTNAME": "muscle-factory-gym.kha-akashanadeel.workers.dev"
    },
    "hyperdrive": [
      {
        "binding": "HYPERDRIVE",
        "id": "<paste-your-id-here>"
      }
    ]
  }
  ```

  **Replace `<paste-your-id-here>` with the actual UUID from Task 1 Step 6.** Without the real ID, the deploy will succeed but the binding will be invalid and queries will fail with a binding error.

- [ ] **Step 3: Verify the JSON is valid**

  ```powershell
  npx wrangler types --dry-run
  ```

  Expected: no error. If wrangler reports a JSON parse error, fix the syntax (likely a missing comma after `"vars": {...}`).

  If `wrangler types --dry-run` isn't a recognized command in your version, alternatively run:

  ```powershell
  node -e "JSON.parse(require('fs').readFileSync('wrangler.jsonc','utf8').replace(/\/\/.*/g, ''))"
  ```

  Expected: no output (JSON is valid). Errors mean syntax problems.

- [ ] **Step 4: Commit**

  ```powershell
  git add wrangler.jsonc
  git commit -m "feat: bind Cloudflare Hyperdrive (gym-db) to the worker"
  ```

---

## Task 3: Rewrite `src/db/index.ts` with 2-branch connection-string resolution

**Why:** The worker needs to read `env.HYPERDRIVE.connectionString` when running in CF (the new path), while everything else (dev, tests, drizzle-kit) keeps reading `process.env.DATABASE_URL` (the unchanged path). The `try/catch + require` pattern does runtime feature detection without breaking test-time module loads.

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: Read the current file**

  Current content (verified at start of phase, 17 lines):

  ```ts
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
  ```

- [ ] **Step 2: Replace its entire contents with the new version**

  ```ts
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
  ```

- [ ] **Step 3: Verify the 233 tests still pass**

  ```powershell
  npm test
  ```

  Expected: `Tests  233 passed (233)`.

  If anything fails: the try/catch should be swallowing the require error in test context. Confirm by adding a temporary `console.log` to verify the catch branch fires — but the standard expectation is zero regressions.

- [ ] **Step 4: Verify the local build**

  ```powershell
  npm run build
  ```

  Expected: success. The `require("@opennextjs/cloudflare")` is wrapped in try/catch so even if Next.js's bundler treats it as a tree-shakeable require, no static analysis should fail.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/db/index.ts
  git commit -m "feat(db): read connection string from Hyperdrive binding when present"
  ```

---

## Task 4: Production build + deploy

**Why:** Push the wrangler binding + the new db/index.ts to Cloudflare. Hyperdrive only takes effect on the live worker, so this is the moment the fix actually applies.

**Files:**
- (none — only running commands)

- [ ] **Step 1: Clean and run cf:build**

  ```powershell
  Remove-Item -Recurse -Force .open-next -ErrorAction SilentlyContinue
  npm run cf:build
  ```

  Expected: ends with `Worker saved in '.open-next\worker.js' 🚀` and `OpenNext build complete.`

  If the build hits the recurring Windows webpack flake (`Cannot find module './XXX.js'`), clean further:

  ```powershell
  Remove-Item -Recurse -Force .next, .open-next, node_modules/.cache -ErrorAction SilentlyContinue
  npm run cf:build
  ```

- [ ] **Step 2: Deploy with Wrangler**

  ```powershell
  npx wrangler deploy
  ```

  Expected output ends with:

  ```
  Uploaded muscle-factory-gym (XX sec)
  Deployed muscle-factory-gym triggers (X sec)
    https://muscle-factory-gym.kha-akashanadeel.workers.dev
    schedule: 30 18 * * *
    schedule: 0 19 * * *
    schedule: 30 1 * * *
    schedule: 0 * * * *
  Current Version ID: <new-uuid>
  ```

  **Look at the "Your Worker has access to the following bindings" section** in the output. It should list:

  ```
  env.ASSETS                    Assets
  env.HYPERDRIVE  ("gym-db")    Hyperdrive
  env.WORKER_HOSTNAME           Environment Variable
  ```

  The `env.HYPERDRIVE ("gym-db")` line is the critical confirmation that the binding wired correctly. If you see `env.HYPERDRIVE  Hyperdrive` without `("gym-db")` or with a missing/empty name, the ID in `wrangler.jsonc` is wrong — re-check Task 2 Step 2.

- [ ] **Step 3: No commit — deploy is a state change on Cloudflare, not in git.**

---

## Task 5: Production smoke test

**Why:** This is the real test. The whole point of Phase 8 is "does the dashboard load consistently when refreshed?" If it does, the migration succeeded.

**Files:**
- (none — manual browser testing)

- [ ] **Step 1: Open the production URL signed in as an admin**

  Browser: `https://muscle-factory-gym.kha-akashanadeel.workers.dev/admin`

  If signed in, you should land directly on `/admin` (the dashboard with stat cards). If not signed in, sign in first via the landing page, then navigate to `/admin`.

  Expected: the dashboard renders with 4 stat cards + 2 recent-activity panels.

- [ ] **Step 2: Hard-reload (Ctrl+Shift+R)**

  Expected: dashboard reloads cleanly. **No 1101 page, no "Application error".**

- [ ] **Step 3: Navigate via the sidebar**

  Click in order: Members → Pending → Plans → Reports → Dashboard.

  Expected: each page loads successfully.

- [ ] **Step 4: Hard-reload at 5 different pages**

  At each of the 5 admin pages, hit Ctrl+Shift+R. All should reload cleanly without errors.

- [ ] **Step 5: Wait 30 seconds, then reload**

  This was the failure mode — cold-start after a brief idle period.

  Expected: page loads cleanly.

- [ ] **Step 6: Wait 5 minutes, then reload**

  Deeper cold start. CF may have spun down worker isolates.

  Expected: page loads cleanly (Hyperdrive's pool stays warm even when worker isolates don't).

- [ ] **Step 7: Quick member-detail test**

  Visit `/admin/members` → click any member row → verify the detail page loads with stat cards.

- [ ] **Step 8: Verify caching doesn't surprise you (optional)**

  - Note the "Total revenue" value on `/admin`
  - Go to `/admin/members/[id]` for any member with an outstanding balance
  - Record a small cash payment via "Record payment" button
  - Return to `/admin` and hard-reload
  - The Total revenue may show old value for up to 60 seconds (Hyperdrive read-cache TTL)
  - Wait 60s, reload again → updated value should appear

  This is expected behavior. If you want zero cache lag, disable read caching in the CF dashboard → Hyperdrive → gym-db config (uncheck the caching toggle, save).

- [ ] **Step 9: If all 8 above pass — Phase 8 done.**

  If any fail, the most likely causes (in order):

  1. **`wrangler.jsonc` ID is wrong** — verify by re-running `npx wrangler deploy` and checking the bindings list output for `env.HYPERDRIVE ("gym-db")`
  2. **Hyperdrive origin connection string in CF dashboard is wrong** — verify the password substitution in Task 1 Step 4
  3. **Supabase pooler is down** — independent of Hyperdrive; check Supabase status page

  None of these require code changes. They're config issues.

---

## Task 6: Tag + update project memory

**Why:** Lock in the milestone. Project memory at `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` keeps history across sessions; tagging gives git a milestone marker.

**Files:**
- (memory update, then git tag)

- [ ] **Step 1: Tag the milestone locally**

  ```powershell
  git tag phase-8
  ```

  Do NOT push yet — see Step 3.

- [ ] **Step 2: Update project memory**

  Open `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` and append a Phase 8 status block similar to Phase 7's. Include:

  - Tag `phase-8` at the green HEAD (current commit SHA from `git log -1 --oneline`)
  - What shipped: Hyperdrive binding (`gym-db`), `getConnectionString()` 2-branch resolution in `src/db/index.ts`, production smoke verified
  - What's deferred: type-safe `env.HYPERDRIVE` ambient declaration (not added; try/catch+optional chaining covers it), Hyperdrive cache tuning (using 60s default), multi-region failover
  - Note that local dev / vitest / drizzle-kit continue using `process.env.DATABASE_URL` — only the production worker uses Hyperdrive
  - Note that the recurring 1101 errors are now resolved

- [ ] **Step 3: Push (optional — user discretion)**

  ```powershell
  git push origin main --tags
  ```

  Phase 3–7 tags were already pushed in an earlier session. Phase 8 follows that pattern.

- [ ] **Step 4: Done. Production is stable.**

---

## Self-Review

**Spec coverage:**

| Design section | Covered by |
|---|---|
| §2.1 What changes (wrangler binding, db/index.ts rewrite, CF dashboard setup) | Tasks 1, 2, 3 |
| §2.2 What doesn't change (schema, call-sites, tests, drizzle.config.ts, package.json) | Implicitly — nothing in those files is touched |
| §3.1 `src/db/index.ts` new shape with `getConnectionString()` | Task 3 |
| §3.2 `wrangler.jsonc` hyperdrive block | Task 2 |
| §3.3 Hyperdrive setup (CF dashboard) | Task 1 |
| §3.4 Optional TypeScript ambient declaration | Explicitly deferred per design §8 |
| §4.1 Production data flow | Tasks 3, 4 ship it; Task 5 verifies it |
| §4.2 Dev/vitest data flow | Task 0 + Task 3 Step 3 (tests still pass) |
| §4.3 Drizzle migrations bypass Hyperdrive | Not implemented because nothing needs implementing — `drizzle.config.ts` already uses `DIRECT_DATABASE_URL` |
| §4.4 Cron-triggered routes | Implicit — same worker path; verified by general smoke (Task 5) |
| §4.5 Caching behavior (60s TTL) | Task 5 Step 8 verifies behavior |
| §5 Error handling (all 8 rows in the table) | Task 3 implements the try/catch + missing-DATABASE_URL throw; everything else is graceful by design and tested by Task 5 |
| §5.1 No new error states introduced | Implicit — verified by Task 0 + Task 3 baseline + Task 5 smoke |
| §6.1 Automated tests — zero new | Task 0 + Task 3 Step 3 |
| §6.3 Production smoke test | Task 5 (matches §6.3's 9 steps verbatim) |
| §6.5 Pre-deploy gates | Task 3 Step 3, Task 3 Step 4, Task 4 Step 1 |
| §7 Done criteria (8 items) | All 8 covered: items 1-2 by Tasks 1-2, item 3 by Task 3, items 4-5 by Task 3 Steps 3-4, items 6 by Task 4, item 7 by Task 5, item 8 by Task 6 |

**Placeholder scan:** No "TBD", "fix later", or "similar to" patterns. Every step has runnable code or a runnable command. The two `<paste-your-id-here>` markers in Task 2 are NOT placeholders — they're explicit instructions to substitute the value generated in Task 1, with a recovery path documented (Task 1 Step 7 note).

**Type consistency:**

- `getConnectionString(): string` defined once in Task 3, used once on the next line.
- `env.HYPERDRIVE.connectionString` shape matches Cloudflare Hyperdrive's documented binding API (per design §3.4).
- `wrangler.jsonc` binding name `"HYPERDRIVE"` (Task 2) matches the `env.HYPERDRIVE` access (Task 3).
- Hyperdrive config name `"gym-db"` is referenced in Tasks 1, 4 (deploy output check), and 5 (CF dashboard cache-tuning location).

Verified consistent.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time, OR execute inline since Tasks 1 and 5 are user-driven and Tasks 2-4 are small enough to do directly.*
