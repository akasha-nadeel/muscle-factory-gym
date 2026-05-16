# Phase 5 — Cron Infrastructure & Lifecycle Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire CF Workers cron triggers for three jobs (nightly expire-memberships, daily inactivate-stale-members, hourly reconcile-payhere) by adding a `scheduled()` dispatcher that wraps the OpenNext-generated worker and internal-fetches bearer-guarded `/api/cron/*` endpoints. Two new endpoints land this phase; the third (reconcile-payhere from Phase 4) is already built and just needs scheduling. **No email / Resend work.**

**Architecture:** Mirror Phase 4's `_*Unsafe` pattern with a new `src/lib/cron/` module. Each cron job: pure-ish DB helper + thin route-handler shell. The dispatcher (`src/worker-with-scheduled.ts`) imports OpenNext's generated worker, re-exports its durable objects, passes through `fetch`, and adds `scheduled()` that maps `event.cron` strings to URL paths. `wrangler.jsonc` `main` flips to the wrapper; `triggers.crons` lists the three schedules.

**Tech Stack:** Same as prior phases — Next.js 15 (App Router), TypeScript, Drizzle ORM, `postgres` driver, Supabase Postgres, Vitest 4, Cloudflare Workers via OpenNext. Package manager: **npm**. No new runtime deps. No schema migration.

**Reference design:** `docs/plans/2026-05-16-phase-5-cron-lifecycle-design.md` (committed at `1c19f3b`).
**Reference Phase 4:** `docs/superpowers/plans/2026-05-16-phase-4-payhere.md` (especially Task 5 helper + Task 8 route, which are the templates this phase mirrors).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell**.
- Every Task ends with one `git commit`.
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- DB-touching tests use `phase5_test_*` clerk-id prefixes and clean up before AND after each test, following `tests/lib/payhere-reconcile.test.ts`.
- "Today" everywhere is the SL local date via `todayInSL()` from `src/lib/tz.ts`.
- `_*Unsafe` helpers do NOT call `requireAdminProfile()` / `requireMemberProfile()` — they're called directly from route handlers (and from tests).
- `vitest.config.ts` has `fileParallelism: false` (Phase 3 finding). Do not change.

---

## File structure (new and modified)

```
src/
  lib/
    cron/
      expire.ts                              (NEW — Task 1: _expireStaleMembershipsUnsafe)
      inactivate.ts                          (NEW — Task 2: _inactivateStaleMembersUnsafe)
  app/
    api/
      cron/
        expire-memberships/route.ts          (NEW — Task 3: thin handler)
        inactivate-stale-members/route.ts    (NEW — Task 4: thin handler)
        reconcile-payhere/route.ts           (unchanged, Phase 4)
  worker-with-scheduled.ts                   (NEW — Task 5: dispatcher)

wrangler.jsonc                               (MODIFY — Task 6: main, triggers.crons, vars)

tests/
  lib/
    cron-expire.test.ts                      (NEW — Task 1)
    cron-inactivate.test.ts                  (NEW — Task 2)
  app/
    api/
      cron-expire-route.test.ts              (NEW — Task 3)
      cron-inactivate-route.test.ts          (NEW — Task 4)
  worker/
    scheduled-dispatcher.test.ts             (NEW — Task 5)
```

No new dependencies. No schema migration.

---

## Task 0: Verify Phase 4 baseline + create directories

**Why:** A two-minute sanity check before adding lifecycle code on top of Phase 4. Confirms the test suite is green and pre-creates the directories so subsequent tasks can drop files in without first-time mkdir prompts.

**Files:**
- (no code changes; directory creation only)

- [ ] **Step 1: Confirm baseline tests green**

  ```powershell
  npm test
  ```

  Expected: `Tests  175 passed (175)` across 34 files. If anything fails, stop and report — Phase 5 should not be built on a red base.

- [ ] **Step 2: Create the new directories**

  ```powershell
  New-Item -ItemType Directory -Path src/lib/cron -Force | Out-Null
  New-Item -ItemType Directory -Path src/app/api/cron/expire-memberships -Force | Out-Null
  New-Item -ItemType Directory -Path src/app/api/cron/inactivate-stale-members -Force | Out-Null
  New-Item -ItemType Directory -Path tests/worker -Force | Out-Null
  ```

  These are no-ops if the directories already exist (they shouldn't).

- [ ] **Step 3: No commit yet — Task 1 onward will make the first real commit.**

---

## Task 1: `_expireStaleMembershipsUnsafe` — flip active memberships past their end_date

**Why:** First lifecycle helper. Nightly cron runs the SQL `UPDATE memberships SET status='expired' WHERE status='active' AND end_date < $today RETURNING id` and returns the count. Single-statement atomic; no transaction wrapper needed; idempotent on re-run.

**Files:**
- Create: `src/lib/cron/expire.ts`
- Create: `tests/lib/cron-expire.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/cron-expire.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _expireStaleMembershipsUnsafe } from "@/lib/cron/expire";

  const CLERK_PREFIX = "user_phase5_test_expire_";
  const PLAN_NAME = "Phase5ExpirePlan";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "expire@x.lk",
        fullName: "Expire Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
  });

  afterEach(clean);

  async function seedMembership(opts: {
    status: "active" | "expired" | "cancelled";
    endDate: string;
  }) {
    const [row] = await db
      .insert(memberships)
      .values({
        memberId,
        planId,
        startDate: "2026-01-01",
        endDate: opts.endDate,
        status: opts.status,
      })
      .returning();
    return row.id;
  }

  describe("_expireStaleMembershipsUnsafe", () => {
    it("flips an active membership with a past end_date to expired", async () => {
      const id = await seedMembership({
        status: "active",
        endDate: "2026-05-15",
      });
      const result = await _expireStaleMembershipsUnsafe({
        todaySL: "2026-05-16",
      });
      expect(result.flipped).toBeGreaterThanOrEqual(1);
      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, id));
      expect(row.status).toBe("expired");
    });

    it("leaves an active membership with a future end_date alone", async () => {
      const id = await seedMembership({
        status: "active",
        endDate: "2026-06-20",
      });
      await _expireStaleMembershipsUnsafe({ todaySL: "2026-05-16" });
      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, id));
      expect(row.status).toBe("active");
    });

    it("does not re-flip a membership that is already expired", async () => {
      const id = await seedMembership({
        status: "expired",
        endDate: "2026-01-15",
      });
      const before = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, id));
      const beforeStatus = before[0].status;
      const result = await _expireStaleMembershipsUnsafe({
        todaySL: "2026-05-16",
      });
      // The already-expired row must not be counted in `flipped`.
      // Other test-prefix rows are isolated; assert by re-reading status.
      const [after] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, id));
      expect(after.status).toBe("expired");
      expect(after.status).toBe(beforeStatus);
      // Helper returned a number — could be 0 or more depending on other test
      // data in the DB. We only assert it's a non-negative integer.
      expect(result.flipped).toBeGreaterThanOrEqual(0);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/lib/cron-expire.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/cron/expire.ts`:

  ```ts
  import { db } from "@/db";
  import { memberships } from "@/db/schema";
  import { and, eq, lt } from "drizzle-orm";

  export type ExpireSummary = { flipped: number };

  /**
   * Flip every membership whose `end_date` is strictly before `todaySL`
   * AND whose status is still `active`, to `status='expired'`.
   *
   * Single-statement UPDATE. Naturally idempotent on re-run — once a row
   * is `expired` it no longer satisfies `status='active'`.
   */
  export async function _expireStaleMembershipsUnsafe(input: {
    todaySL: string;
  }): Promise<ExpireSummary> {
    const flipped = await db
      .update(memberships)
      .set({ status: "expired" })
      .where(
        and(
          eq(memberships.status, "active"),
          lt(memberships.endDate, input.todaySL),
        ),
      )
      .returning({ id: memberships.id });
    return { flipped: flipped.length };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/cron-expire.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/cron/expire.ts tests/lib/cron-expire.test.ts
  git commit -m "feat: _expireStaleMembershipsUnsafe flips active memberships past their end_date"
  ```

---

## Task 2: `_inactivateStaleMembersUnsafe` — flip members with no recent activity to inactive

**Why:** Second lifecycle helper. Daily cron flips `profiles.status` from `active` to `inactive` when `MAX(last_checkin, created_at) < today - 180 days`. Uses a raw SQL `UPDATE ... WHERE id IN (SELECT ...)` because Drizzle's typed builder doesn't express `GREATEST(MAX(...), ...)` cleanly. Guards on `role='member'` so admins never flip.

**Files:**
- Create: `src/lib/cron/inactivate.ts`
- Create: `tests/lib/cron-inactivate.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/cron-inactivate.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, attendance } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _inactivateStaleMembersUnsafe } from "@/lib/cron/inactivate";

  const CLERK_PREFIX = "user_phase5_test_inactivate_";

  async function clean() {
    const rows = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const r of rows) {
      await db.delete(attendance).where(eq(attendance.memberId, r.id));
    }
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(clean);
  afterEach(clean);

  async function insertProfile(opts: {
    suffix: string;
    role: "member" | "admin";
    status: "active" | "pending" | "inactive";
    createdAt: Date;
  }) {
    const [row] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}${opts.suffix}`,
        email: `${opts.suffix}@x.lk`,
        fullName: `Inactivate ${opts.suffix}`,
        role: opts.role,
        status: opts.status,
        createdAt: opts.createdAt,
      })
      .returning();
    return row;
  }

  async function insertCheckin(memberId: string, when: Date) {
    await db.insert(attendance).values({
      memberId,
      checkedInAt: when,
      source: "kiosk_id",
    });
  }

  describe("_inactivateStaleMembersUnsafe", () => {
    it("flips a member with last check-in 200 days ago", async () => {
      const m = await insertProfile({
        suffix: "lapsed",
        role: "member",
        status: "active",
        createdAt: new Date("2025-05-01"),
      });
      await insertCheckin(m.id, new Date("2025-10-28")); // ~200 days before 2026-05-16
      await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
      const [after] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, m.id));
      expect(after.status).toBe("inactive");
    });

    it("leaves a member with a recent check-in active", async () => {
      const m = await insertProfile({
        suffix: "recent",
        role: "member",
        status: "active",
        createdAt: new Date("2025-05-01"),
      });
      await insertCheckin(m.id, new Date("2026-04-30")); // 16 days before today
      await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
      const [after] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, m.id));
      expect(after.status).toBe("active");
    });

    it("leaves a never-checked-in member with a recent created_at active", async () => {
      const m = await insertProfile({
        suffix: "newbie",
        role: "member",
        status: "active",
        createdAt: new Date("2026-05-01"), // 15 days before today
      });
      await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
      const [after] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, m.id));
      expect(after.status).toBe("active");
    });

    it("flips a never-checked-in member whose created_at is 200 days ago", async () => {
      const m = await insertProfile({
        suffix: "ghost",
        role: "member",
        status: "active",
        createdAt: new Date("2025-10-28"), // ~200 days before today
      });
      await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
      const [after] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, m.id));
      expect(after.status).toBe("inactive");
    });

    it("never flips an admin profile, even if last check-in is >180 days ago", async () => {
      const a = await insertProfile({
        suffix: "admin",
        role: "admin",
        status: "active",
        createdAt: new Date("2025-01-01"), // very old
      });
      await _inactivateStaleMembersUnsafe({ todaySL: "2026-05-16" });
      const [after] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, a.id));
      expect(after.status).toBe("active");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/lib/cron-inactivate.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/cron/inactivate.ts`:

  ```ts
  import { db } from "@/db";
  import { sql } from "drizzle-orm";

  export type InactivateSummary = { flipped: number };

  /**
   * Flip every `profiles` row that satisfies all of:
   *   - status = 'active'
   *   - role = 'member'      (admins are never inactivated)
   *   - MAX(last_checkin, created_at)::date < $todaySL::date - 180 days
   *
   * `MAX(last_checkin)` falls back to '1900-01-01' for members with zero
   * attendance rows, so the effective last-activity date is the profile's
   * `created_at` for never-checked-in members.
   *
   * Soft-only: profile row stays, status flips. Attendance, memberships,
   * payments are all preserved.
   */
  export async function _inactivateStaleMembersUnsafe(input: {
    todaySL: string;
  }): Promise<InactivateSummary> {
    const result = await db.execute(sql`
      WITH stale AS (
        SELECT p.id
        FROM profiles p
        LEFT JOIN attendance a ON a.member_id = p.id
        WHERE p.status = 'active'
          AND p.role = 'member'
        GROUP BY p.id
        HAVING GREATEST(
          COALESCE(MAX(a.checked_in_at)::date, DATE '1900-01-01'),
          p.created_at::date
        ) < (${input.todaySL}::date - INTERVAL '180 days')
      )
      UPDATE profiles
      SET status = 'inactive'
      WHERE id IN (SELECT id FROM stale)
      RETURNING id
    `);

    // postgres-js returns rows either as an array directly or wrapped in
    // { rows: [] } depending on driver version. Handle both.
    const rows =
      (result as unknown as { rows?: unknown[] }).rows ??
      (result as unknown as unknown[]);
    const flipped = Array.isArray(rows) ? rows.length : 0;
    return { flipped };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/cron-inactivate.test.ts
  ```

  If a test fails because `flipped` is `0` when you expected `>= 1`, log the raw `result` once to inspect the row-shape: replace the `const rows = ...` block temporarily with `console.log(JSON.stringify(result, null, 2)); throw new Error("debug");`, run the test, observe the shape, then revert the log and adjust the row-access code.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/cron/inactivate.ts tests/lib/cron-inactivate.test.ts
  git commit -m "feat: _inactivateStaleMembersUnsafe flips profiles past 180-day activity threshold"
  ```

---

## Task 3: `POST /api/cron/expire-memberships` route

**Why:** Bearer-guarded HTTP wrapper around `_expireStaleMembershipsUnsafe`. Identical shape to Phase 4's `reconcile-payhere/route.ts`. CF cron triggers will internal-fetch this in Task 5; manual curl-testable in the meantime.

**Files:**
- Create: `src/app/api/cron/expire-memberships/route.ts`
- Create: `tests/app/api/cron-expire-route.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/api/cron-expire-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { POST } from "@/app/api/cron/expire-memberships/route";

  const CLERK_PREFIX = "user_phase5_test_expireroute_";
  const PLAN_NAME = "Phase5ExpireRoutePlan";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(async () => {
    await clean();
    process.env.CRON_SECRET = "phase5-expire-route-secret";
  });

  afterEach(clean);

  describe("POST /api/cron/expire-memberships", () => {
    it("returns 401 without the bearer header", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/expire-memberships", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 on wrong bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/expire-memberships", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 + summary on correct bearer and flips a stale row", async () => {
      const [pl] = await db
        .insert(plans)
        .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
        .returning();
      const [m] = await db
        .insert(profiles)
        .values({
          clerkUserId: `${CLERK_PREFIX}member`,
          email: "exproute@x.lk",
          fullName: "Expire Route Member",
          role: "member",
          status: "active",
        })
        .returning();
      const [mem] = await db
        .insert(memberships)
        .values({
          memberId: m.id,
          planId: pl.id,
          startDate: "2026-01-01",
          endDate: "2026-05-15",
          status: "active",
        })
        .returning();

      const res = await POST(
        new Request("http://localhost/api/cron/expire-memberships", {
          method: "POST",
          headers: { authorization: "Bearer phase5-expire-route-secret" },
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { flipped: number };
      expect(typeof json.flipped).toBe("number");
      expect(json.flipped).toBeGreaterThanOrEqual(1);

      const [reloaded] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, mem.id));
      expect(reloaded.status).toBe("expired");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/cron-expire-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/cron/expire-memberships/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { _expireStaleMembershipsUnsafe } from "@/lib/cron/expire";
  import { todayInSL } from "@/lib/tz";

  export async function POST(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "server misconfigured" },
        { status: 500 },
      );
    }

    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const summary = await _expireStaleMembershipsUnsafe({
      todaySL: todayInSL(),
    });
    return NextResponse.json(summary);
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/cron-expire-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/cron/expire-memberships/ tests/app/api/cron-expire-route.test.ts
  git commit -m "feat: /api/cron/expire-memberships endpoint (bearer-guarded)"
  ```

---

## Task 4: `POST /api/cron/inactivate-stale-members` route

**Why:** Bearer-guarded HTTP wrapper around `_inactivateStaleMembersUnsafe`. Same shape as Task 3.

**Files:**
- Create: `src/app/api/cron/inactivate-stale-members/route.ts`
- Create: `tests/app/api/cron-inactivate-route.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/api/cron-inactivate-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, attendance } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { POST } from "@/app/api/cron/inactivate-stale-members/route";

  const CLERK_PREFIX = "user_phase5_test_inactivateroute_";

  async function clean() {
    const rows = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const r of rows) {
      await db.delete(attendance).where(eq(attendance.memberId, r.id));
    }
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(async () => {
    await clean();
    process.env.CRON_SECRET = "phase5-inactivate-route-secret";
  });

  afterEach(clean);

  describe("POST /api/cron/inactivate-stale-members", () => {
    it("returns 401 without the bearer header", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/inactivate-stale-members", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 on wrong bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/inactivate-stale-members", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 + summary and flips a stale member", async () => {
      // Member who joined 250 days ago with no check-ins.
      // Use a recent calendar; the date math is in the helper.
      const oldCreatedAt = new Date();
      oldCreatedAt.setUTCDate(oldCreatedAt.getUTCDate() - 250);

      const [m] = await db
        .insert(profiles)
        .values({
          clerkUserId: `${CLERK_PREFIX}ghost`,
          email: "inact-route@x.lk",
          fullName: "Inactivate Route Member",
          role: "member",
          status: "active",
          createdAt: oldCreatedAt,
        })
        .returning();

      const res = await POST(
        new Request(
          "http://localhost/api/cron/inactivate-stale-members",
          {
            method: "POST",
            headers: {
              authorization: "Bearer phase5-inactivate-route-secret",
            },
          },
        ),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { flipped: number };
      expect(typeof json.flipped).toBe("number");
      expect(json.flipped).toBeGreaterThanOrEqual(1);

      const [reloaded] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, m.id));
      expect(reloaded.status).toBe("inactive");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/cron-inactivate-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/cron/inactivate-stale-members/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { _inactivateStaleMembersUnsafe } from "@/lib/cron/inactivate";
  import { todayInSL } from "@/lib/tz";

  export async function POST(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "server misconfigured" },
        { status: 500 },
      );
    }

    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const summary = await _inactivateStaleMembersUnsafe({
      todaySL: todayInSL(),
    });
    return NextResponse.json(summary);
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/cron-inactivate-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/cron/inactivate-stale-members/ tests/app/api/cron-inactivate-route.test.ts
  git commit -m "feat: /api/cron/inactivate-stale-members endpoint (bearer-guarded)"
  ```

---

## Task 5: `worker-with-scheduled.ts` — the dispatcher

**Why:** CF Workers cron triggers fire `scheduled(event, env, ctx)`, not `fetch()`. OpenNext's generated `.open-next/worker.js` only exports `fetch`. We need a wrapper that delegates `fetch` to OpenNext, re-exports the durable objects, and adds `scheduled()` that internal-fetches each cron's URL with `Authorization: Bearer ${CRON_SECRET}`.

**Files:**
- Create: `src/worker-with-scheduled.ts`
- Create: `tests/worker/scheduled-dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/worker/scheduled-dispatcher.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

  // Mock OpenNext's worker module before importing the dispatcher.
  // The wrapper does `import worker from "../.open-next/worker.js"` and
  // `export { DOQueueHandler, ... } from "../.open-next/worker.js"`.
  vi.mock("../../.open-next/worker.js", () => {
    const fetchHandler = vi.fn();
    return {
      default: { fetch: fetchHandler },
      DOQueueHandler: class {},
      DOShardedTagCache: class {},
      BucketCachePurge: class {},
    };
  });

  type FakeCtx = {
    waitUntil: (p: Promise<unknown>) => void;
    flush: () => Promise<unknown[]>;
  };
  function makeCtx(): FakeCtx {
    const promises: Promise<unknown>[] = [];
    return {
      waitUntil: (p) => promises.push(p),
      flush: () => Promise.all(promises),
    };
  }

  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("worker-with-scheduled — scheduled()", () => {
    it("does nothing and warns on an unknown cron string", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { default: worker } = await import("@/worker-with-scheduled");
      const ctx = makeCtx();
      await worker.scheduled(
        { cron: "1 2 3 4 5" } as unknown as ScheduledEvent,
        { CRON_SECRET: "s", WORKER_HOSTNAME: "h" } as unknown as Env,
        ctx as unknown as ExecutionContext,
      );
      await ctx.flush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it("fetches the mapped URL with the bearer for a known cron", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const { default: worker } = await import("@/worker-with-scheduled");
      const ctx = makeCtx();
      await worker.scheduled(
        { cron: "30 18 * * *" } as unknown as ScheduledEvent,
        {
          CRON_SECRET: "secret-x",
          WORKER_HOSTNAME: "gym.example",
        } as unknown as Env,
        ctx as unknown as ExecutionContext,
      );
      await ctx.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://gym.example/api/cron/expire-memberships",
      );
      expect((init as RequestInit).method).toBe("POST");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer secret-x");
    });

    it("logs a warning when the route responds with non-2xx but does not throw", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { default: worker } = await import("@/worker-with-scheduled");
      const ctx = makeCtx();
      await worker.scheduled(
        { cron: "0 * * * *" } as unknown as ScheduledEvent,
        {
          CRON_SECRET: "secret-x",
          WORKER_HOSTNAME: "gym.example",
        } as unknown as Env,
        ctx as unknown as ExecutionContext,
      );
      await ctx.flush();
      expect(warn).toHaveBeenCalled();
    });
  });

  // Minimal type shims so the test file type-checks without the full
  // @cloudflare/workers-types dep. These mirror the runtime shapes used.
  type ScheduledEvent = { cron: string };
  type ExecutionContext = { waitUntil: (p: Promise<unknown>) => void };
  type Env = { CRON_SECRET: string; WORKER_HOSTNAME: string };
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/worker/scheduled-dispatcher.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/worker-with-scheduled.ts`:

  ```ts
  // Wraps the OpenNext-generated worker with a `scheduled()` handler so we
  // can use CF Workers cron triggers. `fetch` is a pass-through to OpenNext.
  // We re-export OpenNext's durable objects so wrangler's `main` swap is
  // a drop-in replacement.

  // @ts-expect-error: resolved at build time after `npm run cf:build`
  import openNextWorker from "../.open-next/worker.js";
  // @ts-expect-error: same
  export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

  type Env = {
    CRON_SECRET?: string;
    WORKER_HOSTNAME?: string;
  };

  type ScheduledEvent = { cron: string };

  type ExecutionContext = {
    waitUntil: (p: Promise<unknown>) => void;
  };

  /**
   * Mapping from cron expression (as it appears in wrangler.jsonc) to the
   * URL path of the bearer-guarded endpoint we should invoke. Keep these
   * in lock-step with wrangler.jsonc `triggers.crons`.
   */
  const ROUTES: Record<string, string> = {
    "30 18 * * *": "/api/cron/expire-memberships",
    "0 19 * * *": "/api/cron/inactivate-stale-members",
    "0 * * * *": "/api/cron/reconcile-payhere",
  };

  export default {
    fetch: openNextWorker.fetch,

    async scheduled(
      event: ScheduledEvent,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> {
      const path = ROUTES[event.cron];
      if (!path) {
        console.warn(`[scheduled] no route for cron "${event.cron}"`);
        return;
      }
      const cronSecret = env.CRON_SECRET;
      const host = env.WORKER_HOSTNAME;
      if (!cronSecret || !host) {
        console.warn(
          `[scheduled] missing env (CRON_SECRET or WORKER_HOSTNAME) for "${event.cron}"`,
        );
        return;
      }
      const url = `https://${host}${path}`;
      ctx.waitUntil(
        fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${cronSecret}` },
        })
          .then(async (r) => {
            if (!r.ok) {
              console.warn(
                `[scheduled] ${event.cron} → ${url} returned ${r.status}`,
              );
            }
          })
          .catch((err) => {
            console.warn(
              `[scheduled] ${event.cron} → ${url} fetch failed: ${err}`,
            );
          }),
      );
    },
  };
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/worker/scheduled-dispatcher.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/worker-with-scheduled.ts tests/worker/scheduled-dispatcher.test.ts
  git commit -m "feat: scheduled() dispatcher wraps OpenNext + routes cron events via internal fetch"
  ```

---

## Task 6: Wire crons in `wrangler.jsonc`

**Why:** Flip `main` from the OpenNext-generated worker to our wrapper, add the `triggers.crons` array, and add `WORKER_HOSTNAME` to `vars` so the dispatcher knows where to fetch.

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Read the current file**

  Already known content:

  ```jsonc
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "muscle-factory-gym",
    "main": ".open-next/worker.js",
    "compatibility_date": "2025-12-01",
    "compatibility_flags": ["nodejs_compat"],
    "assets": {
      "directory": ".open-next/assets",
      "binding": "ASSETS",
      "run_worker_first": true
    },
    "observability": {
      "enabled": true
    }
  }
  ```

- [ ] **Step 2: Replace it**

  Use the Write tool to overwrite `wrangler.jsonc` with the full new content:

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
        "0 * * * *"
      ]
    },
    "vars": {
      "WORKER_HOSTNAME": "muscle-factory-gym.kha-akashanadeel.workers.dev"
    }
  }
  ```

  Three things changed: `main` now points at the TS wrapper; new `triggers.crons` block; new `vars` block. Comments (// 18:30 UTC ≈ 00:00 SL etc.) intentionally omitted to keep the JSONC strictly valid — wrangler's schema validator can be strict.

- [ ] **Step 3: Run the local cf-build to confirm the wrapper resolves**

  ```powershell
  npm run cf:build
  ```

  Expected: build succeeds. The OpenNext build runs first, regenerating `.open-next/worker.js`, then wrangler bundles `src/worker-with-scheduled.ts` which imports it. If you see "Could not resolve `../.open-next/worker.js`", the OpenNext build did not run or did not regenerate the file — re-run from a clean `.open-next` directory:

  ```powershell
  Remove-Item -Recurse -Force .open-next ; npm run cf:build
  ```

  If you see a TypeScript error about `DOQueueHandler` or another durable-object re-export, OpenNext's worker.js no longer exports it under that name. Open `.open-next/worker.js` and find the actual `export { ... }` line near the top; mirror those names in `src/worker-with-scheduled.ts`.

- [ ] **Step 4: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: all green (175 baseline + new Phase 5 tests). The wrangler.jsonc change does not affect runtime tests.

- [ ] **Step 5: Commit**

  ```powershell
  git add wrangler.jsonc
  git commit -m "feat: wire triggers.crons + flip wrangler main to src/worker-with-scheduled.ts"
  ```

---

## Task 7: End-to-end walkthrough + Phase 5 tag

**Why:** Verify the full Phase 5 surface works locally, then tag the milestone.

- [ ] **Step 1: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: ~189 tests passing across ~37 files (175 baseline + 14 new: 3 expire-helper + 5 inactivate-helper + 3 expire-route + 3 inactivate-route + 3 dispatcher = 17; adjust the target if dispatcher tests count differently).

- [ ] **Step 2: Run the production-build chain**

  ```powershell
  npm run build
  ```

  Expected: success. New routes `/api/cron/expire-memberships` and `/api/cron/inactivate-stale-members` appear in the route table.

  ```powershell
  npm run cf:build
  ```

  Expected: success.

- [ ] **Step 3: Manual curl smoke against `npm run dev` (optional but recommended)**

  In one PowerShell window:

  ```powershell
  $env:CRON_SECRET = "local-dev-cron-secret"
  npm run dev
  ```

  In a second PowerShell window:

  ```powershell
  # Expire-memberships smoke
  curl.exe -X POST http://localhost:3000/api/cron/expire-memberships `
    -H "authorization: Bearer local-dev-cron-secret"
  # Expected: 200 + {"flipped": <n>}

  # Inactivate smoke
  curl.exe -X POST http://localhost:3000/api/cron/inactivate-stale-members `
    -H "authorization: Bearer local-dev-cron-secret"
  # Expected: 200 + {"flipped": <n>}

  # Wrong bearer smoke
  curl.exe -X POST http://localhost:3000/api/cron/expire-memberships `
    -H "authorization: Bearer wrong"
  # Expected: 401
  ```

  Stop the dev server (Ctrl+C in the first window) when done.

- [ ] **Step 4: Tag the milestone**

  ```powershell
  git tag phase-5
  ```

  Do NOT push without explicit user authorization (Phase 3 and Phase 4 tags are also unpushed by user preference).

- [ ] **Step 5: Update project memory**

  Update `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` by appending a new Phase 5 status block. Include:

  - Tag `phase-5` at the green HEAD.
  - What shipped: 2 helpers, 2 routes, dispatcher, wrangler.jsonc triggers/vars, ~14 new tests.
  - What's deferred: Resend SDK + reminder cron + receipt emails + approval emails (all email work); production deploy (same OpenNext/CF gap).
  - Note that wrangler.jsonc `main` is no longer `.open-next/worker.js`; future deploys will use the wrapper. If `npm run cf:build` ever fails on re-export names, OpenNext's durable-object exports may have shifted (one-line fix to `src/worker-with-scheduled.ts`).

---

## Self-Review

**Spec coverage:**

| Design section | Covered by |
|---|---|
| §2.1 expire-memberships route | Task 3 |
| §2.1 inactivate-stale-members route | Task 4 |
| §2.1 reconcile-payhere route | Phase 4 (Task 8) — unchanged |
| §2.2 worker-with-scheduled.ts wrapper | Task 5 |
| §3 file layout | Tasks 1–5 |
| §4.1 expire data flow | Tasks 1, 3, 5 (dispatcher routes the cron string) |
| §4.2 inactivate data flow + 3 invariants (role=member, COALESCE fallback, soft-only) | Task 2 |
| §4.3 reconcile-payhere data flow (no new code; dispatcher wires it) | Tasks 5, 6 |
| §4.4 cross-flow ordering (00:00 SL expire then 00:30 SL inactivate) | Task 6 (wrangler.jsonc cron strings) |
| §5 error handling (every row in the table) | Tests in Tasks 1, 2, 3, 4, 5; dispatcher's warn-not-throw covered in Task 5 |
| §6 env vars (CRON_SECRET reused, WORKER_HOSTNAME new) | Tasks 5 (dispatcher reads them), 6 (wrangler.jsonc sets WORKER_HOSTNAME) |
| §7.1 DB integration tests | Tasks 1, 2 |
| §7.2 Route handler tests | Tasks 3, 4 |
| §7.3 Dispatcher tests | Task 5 |
| §7.4 Local E2E smoke (manual) | Task 7 Step 3 |
| §8 done criteria | Task 7 |
| §9 deferrals | Documented; not implemented |

**Placeholder scan:** No "TBD", "TODO", "similar to" — every step has runnable code or runnable commands. Two pieces of dynamic context worth noting:
- Task 2 Step 4 mentions a fallback debug step if the postgres-js row-shape differs (consistent with the documented quirk in Phase 4 Task 4); this is debugging guidance, not a placeholder.
- Task 6 Step 3 mentions a fallback if OpenNext durable-object exports shift; concrete one-line edit, not a placeholder.

**Type consistency:**
- `ExpireSummary = { flipped: number }` used in Task 1 helper + Task 3 route + Task 7 walkthrough.
- `InactivateSummary = { flipped: number }` used in Task 2 helper + Task 4 route + Task 7 walkthrough.
- `ROUTES` map in Task 5 dispatcher mirrors the three cron strings in Task 6 `wrangler.jsonc triggers.crons`.
- All cron route handlers export `POST` (not `GET` / `PATCH`) and read `process.env.CRON_SECRET`.
- All bearer comparisons use exact string match against `\`Bearer ${cronSecret}\``.
Verified consistent.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time with review between each commit.*
