# Phase 1 — Members & Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new member can sign up, land on the right post-sign-in page, see a "pending approval" screen, and an admin can approve them by picking a plan — at which point their profile flips to `active`, a `memberships` row is created, and the member portal shows their plan and expiry date.

**Architecture:** Add an admin shell with sidebar nav, build CRUD for plans, a paginated/filterable member list with detail view, and a pending-approval queue with an atomic "approve member" server action. The member portal renders different content based on `profiles.status` (pending / active / inactive). All Phase 1 mutations go through Next.js Server Actions; every admin action calls `requireAdminProfile()` at its first line. No payment rows are written in this phase — payments are Phase 2.

**Tech Stack (already installed):** Next.js 15 (App Router), React 19 + `useActionState`, TypeScript, Tailwind v4, shadcn/ui (base-ui), Clerk v7 (`@clerk/nextjs ^7.3.3`), Drizzle ORM, `postgres` driver, Supabase Postgres, Vitest 4, OpenNext Cloudflare adapter. Added in this phase: `date-fns` (membership date math), `zod` (server-action input validation), shadcn `form` component (auto-generated). No `react-hook-form` — Server Actions + `useActionState` only.

**Reference design:** `docs/plans/2026-05-14-gym-management-system-design.md` (§3 schema, §4.1 approval flow, §5 auth, §8 phases).
**Reference Phase 0:** `docs/superpowers/plans/2026-05-14-phase-0-foundation.md` (what's already on disk).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **pnpm** (matches `package.json` `packageManager` field; CF Workers Build uses pnpm too).
- Shell: **PowerShell** (Windows). When a command differs from bash, the PowerShell form is shown.
- Every Task ends with one `git commit`. Commit message style: `feat:`, `fix:`, `chore:`, `test:`.
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- Tests live under `tests/`. Vitest config already aliases `@` to `./src`. The `tests/setup.ts` loads `.env.local`. DB-touching tests insert and clean up their own rows.
- **Server Actions** are `"use server"` files colocated with the route group: `src/app/admin/<feature>/actions.ts`.
- **All admin mutations** must call `requireAdminProfile()` (Task 1) at the top. **All member mutations** must call `requireMemberProfile()`. Don't rely on layout-level gating alone — actions are independently reachable.

---

## Pre-flight (read once before starting Task 0)

Phase 0 is on `main` and deployed. Live URL: `https://muscle-factory-gym.kha-akashanadeel.workers.dev`. The known open issue from Phase 0:

> **Post-sign-in redirect lands on `/` instead of `/portal`.** Nine prior commits (3ad7fda, 48146f6, b881fb9, …) tried to fix this by passing `fallbackRedirectUrl="/portal"` as a prop to `<SignIn>`/`<SignUp>`. Every one of those broke the CF deploy with `Error in routingHandler Error: @clerk/nextjs: Missing secretKey`. **Do not retry that approach.**

**Diagnostic already done (cite this in your reasoning when you start Task 0):**

`node_modules/@clerk/nextjs/dist/esm/utils/mergeNextClerkPropsWithEnv.js` (lines 36–39) shows what env vars Clerk v7 actually reads:

```js
signInForceRedirectUrl: props.signInForceRedirectUrl || process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL || "",
signUpForceRedirectUrl: props.signUpForceRedirectUrl || process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL || "",
signInFallbackRedirectUrl: props.signInFallbackRedirectUrl || process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL || "",
signUpFallbackRedirectUrl: props.signUpFallbackRedirectUrl || process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL || "",
```

The string `AFTER_SIGN_IN_URL` does **not appear in that file** — Clerk v7 silently ignores the old env var name. The fix is rename-only.

Also see memory: `reference_cf_workers_env_vars.md` — CF Workers Builds has **two separate env-var stores** (Build + Runtime); `NEXT_PUBLIC_*` must be in **both**.

---

## Task 0: Fix the Clerk v7 post-sign-in redirect (env-var rename)

**Goal:** Sign in on the live URL and land on `/portal` (or `/admin` for admin users) instead of `/`.

**Files:**
- Modify: `.env.local`
- No code changes to `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `sign-up/page.tsx`, or `src/middleware.ts`. The prop-passing path is the failed path; we are explicitly **not** going there.

- [ ] **Step 1: Reproduce the bug locally**

  ```powershell
  pnpm dev
  ```
  Open http://localhost:3000 in a fresh incognito window. Sign in with any existing Clerk user. **Expected (current bug):** after submitting credentials, you land on `/`, not `/portal`. Note this in a scratch file so you can confirm the fix.

  Stop the dev server with Ctrl+C.

- [ ] **Step 2: Inspect what env vars Clerk v7 reads (diagnostic confirmation)**

  Open `node_modules/@clerk/nextjs/dist/esm/utils/mergeNextClerkPropsWithEnv.js`. Confirm lines 36–39 read `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`. Confirm the string `AFTER_SIGN_IN_URL` is absent from this file:

  ```powershell
  Select-String -Path .\node_modules\@clerk\nextjs\dist\esm\utils\mergeNextClerkPropsWithEnv.js -Pattern "AFTER_SIGN_IN_URL"
  ```
  Expected: no matches (empty output, exit code 1).

- [ ] **Step 3: Add the new env-var names to `.env.local`**

  Keep the old `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` lines so older Clerk SDKs (if anyone clones a fresh checkout with a different lockfile) still work. Add the new v7 names alongside:

  ```
  # Clerk v6 names (kept for compatibility; v7 ignores these)
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/portal
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/portal

  # Clerk v7 names (the ones actually read by mergeNextClerkPropsWithEnv.js)
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/portal
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/portal
  ```

  These four lines must be present. Don't remove the v6 names.

- [ ] **Step 4: Verify the fix locally**

  ```powershell
  pnpm dev
  ```
  Sign out, then sign in again in a fresh incognito window. **Expected:** post-sign-in URL is `/portal` (member) or you're redirected `/portal → /admin` if you're signed in as an admin.

  If still landing on `/`: hard-refresh, then `pnpm build && pnpm start` to rule out a dev-mode HMR caching issue. **Do not** add a prop to `<SignIn>` — that is the failed path.

  Stop the dev server.

- [ ] **Step 5: Add the new env-var names to Cloudflare Workers (BOTH stores)**

  This is a manual dashboard step. The subagent should pause here and ask the human to do it.

  In the Cloudflare dashboard for the `muscle-factory-gym` worker:

  1. **Build vars** (Settings → Builds → "Variables and secrets" — bottom of the Builds section):
     - Add `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` = `/portal`
     - Add `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` = `/portal`
     - Type: Plaintext for both.

  2. **Runtime vars** (Settings → "Variables and Secrets" near the top of the right column):
     - Add the same two vars with the same values. Plaintext type.

  Save both panels.

- [ ] **Step 6: Trigger a redeploy and verify on the live URL**

  ```powershell
  git add .env.local
  git commit -m "fix: rename clerk redirect env vars to v7 names (NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL)"
  git push
  ```

  Wait for CF Workers Build to finish (~3–5 min). Then open `https://muscle-factory-gym.kha-akashanadeel.workers.dev` in a fresh incognito window. Sign in. Expected: redirected to `/portal`.

  If it still lands on `/`: check both env-var stores have the new names spelled exactly right (case-sensitive). Check CF Observability logs for any `routingHandler` errors. **Do not** add the prop. Re-read the diagnostic in Step 2.

- [ ] **Step 7: Note in the team-shared memory that this is now fixed**

  The CF env-vars memory file still describes this as an "open issue to fix in Phase 1." After verification, this can stop being a flagged issue. (Memory update is the parent assistant's job, not the subagent's — but mention completion in your task report.)

---

## Task 1: Profile helpers — DB-backed `getCurrentProfile` and `requireAdminProfile`

**Goal:** Every Phase 1 page and server action needs the *profile row*, not just the Clerk userId. Centralize this.

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `tests/lib/profile.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/profile.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { getProfileByClerkId } from "@/lib/auth";

  const TEST_CLERK_ID = "user_profile_test_1";
  const TEST_EMAIL = "profile-test@example.com";

  describe("getProfileByClerkId", () => {
    beforeEach(async () => {
      await db.delete(profiles).where(eq(profiles.clerkUserId, TEST_CLERK_ID));
    });
    afterEach(async () => {
      await db.delete(profiles).where(eq(profiles.clerkUserId, TEST_CLERK_ID));
    });

    it("returns null when no profile exists for the clerk id", async () => {
      const row = await getProfileByClerkId(TEST_CLERK_ID);
      expect(row).toBeNull();
    });

    it("returns the profile row when one exists", async () => {
      await db.insert(profiles).values({
        clerkUserId: TEST_CLERK_ID,
        email: TEST_EMAIL,
        fullName: "Profile Test",
        role: "member",
        status: "pending",
      });
      const row = await getProfileByClerkId(TEST_CLERK_ID);
      expect(row).not.toBeNull();
      expect(row!.email).toBe(TEST_EMAIL);
      expect(row!.role).toBe("member");
      expect(row!.status).toBe("pending");
    });
  });
  ```

- [ ] **Step 2: Run the test — expect failure (import not found)**

  ```powershell
  pnpm test tests/lib/profile.test.ts
  ```
  Expected: fails — `getProfileByClerkId` not exported from `@/lib/auth`.

- [ ] **Step 3: Extend `src/lib/auth.ts`**

  Replace the full file contents with:
  ```ts
  import { auth } from "@clerk/nextjs/server";
  import { redirect } from "next/navigation";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import type { InferSelectModel } from "drizzle-orm";

  export type Role = "admin" | "member";
  export type Profile = InferSelectModel<typeof profiles>;

  export async function getCurrentUser() {
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;
    const role =
      (sessionClaims?.metadata as { role?: Role } | undefined)?.role ?? "member";
    return { userId, role };
  }

  export async function getProfileByClerkId(
    clerkUserId: string,
  ): Promise<Profile | null> {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.clerkUserId, clerkUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  export async function getCurrentProfile(): Promise<Profile | null> {
    const u = await getCurrentUser();
    if (!u) return null;
    return getProfileByClerkId(u.userId);
  }

  export async function requireAdmin() {
    const u = await getCurrentUser();
    if (!u) redirect("/sign-in");
    if (u.role !== "admin") redirect("/portal");
    return u;
  }

  export async function requireMember() {
    const u = await getCurrentUser();
    if (!u) redirect("/sign-in");
    return u;
  }

  /**
   * For server actions / route handlers that mutate as an admin. Re-checks role
   * AND fetches the profile row so the caller has the admin's profile id
   * (for createdBy / recordedBy audit columns).
   */
  export async function requireAdminProfile(): Promise<Profile> {
    const u = await getCurrentUser();
    if (!u) redirect("/sign-in");
    if (u.role !== "admin") redirect("/portal");
    const profile = await getProfileByClerkId(u.userId);
    if (!profile) {
      throw new Error(
        "admin session has no matching profile row — webhook never fired?",
      );
    }
    return profile;
  }

  export async function requireMemberProfile(): Promise<Profile> {
    const u = await getCurrentUser();
    if (!u) redirect("/sign-in");
    const profile = await getProfileByClerkId(u.userId);
    if (!profile) {
      throw new Error(
        "member session has no matching profile row — webhook never fired?",
      );
    }
    return profile;
  }
  ```

- [ ] **Step 4: Run the test — expect pass**

  ```powershell
  pnpm test tests/lib/profile.test.ts
  ```
  Expected: both cases pass.

- [ ] **Step 5: Run the full test suite (regression check)**

  ```powershell
  pnpm test
  ```
  Expected: all existing tests still pass (role-decision, schema, webhook upsert) plus the new profile tests.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/lib/auth.ts tests/lib/profile.test.ts
  git commit -m "feat: add getProfileByClerkId, getCurrentProfile, requireAdminProfile, requireMemberProfile"
  ```

---

## Task 2: Install runtime deps (date-fns, zod) and add shadcn `form`

**Files:**
- Modify: `package.json` (via pnpm), `src/components/ui/form.tsx` (created by shadcn CLI)

- [ ] **Step 1: Install `date-fns` and `zod`**

  ```powershell
  pnpm add date-fns zod
  ```

- [ ] **Step 2: Add shadcn `form` (and `command` for later use in member search)**

  The shadcn v4 registry has been working via `pnpm dlx shadcn@latest add ...`. If `form` requires `react-hook-form` and `@hookform/resolvers`, the CLI will install them — accept that. We won't use `react-hook-form`'s `useForm()` hook directly; we only need the `<Form>` styled wrapper and the `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormMessage>` primitives to wrap our `useActionState` markup.

  ```powershell
  pnpm dlx shadcn@latest add form
  ```

  If the CLI fails or the v4 `form` component doesn't exist, fall back to **not** installing it — Task 3 onwards will use plain `<label>` + `<Input>` + a `<p className="text-destructive text-sm">{error}</p>` for field errors. Note the choice in the commit message either way.

- [ ] **Step 3: Verify nothing broke**

  ```powershell
  pnpm build
  ```
  Expected: build succeeds. (We ignore ESLint during builds — see `next.config.ts`.)

- [ ] **Step 4: Commit**

  ```powershell
  git add package.json pnpm-lock.yaml src/components/ui/
  git commit -m "chore: add date-fns + zod; add shadcn form component"
  ```

  If form install failed, commit message: `chore: add date-fns + zod (shadcn form unavailable, will use plain markup)`.

---

## Task 3: Admin shell — sidebar nav

**Goal:** Replace the bare `<header>` in `src/app/admin/layout.tsx` with a proper admin shell that has persistent navigation. Three nav items for Phase 1: **Members**, **Pending**, **Plans**. (Dashboard / Reports come in later phases.)

**Files:**
- Create:
  - `src/app/admin/_nav.tsx` — client component with active-link highlighting
- Modify:
  - `src/app/admin/layout.tsx`
  - `src/app/admin/page.tsx` (the dashboard landing — keeps a small placeholder for now)

- [ ] **Step 1: Create the nav client component**

  Create `src/app/admin/_nav.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { cn } from "@/lib/utils";

  const items = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/members", label: "Members" },
    { href: "/admin/pending", label: "Pending" },
    { href: "/admin/plans", label: "Plans" },
  ];

  export function AdminNav() {
    const pathname = usePathname();
    return (
      <nav className="flex flex-col gap-1 p-4 w-56 border-r min-h-full">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground px-2 mb-2">
          Gym Admin
        </h2>
        {items.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  ```

- [ ] **Step 2: Update the admin layout to use the nav**

  Replace `src/app/admin/layout.tsx`:
  ```tsx
  import { requireAdmin } from "@/lib/auth";
  import { UserButton } from "@clerk/nextjs";
  import { AdminNav } from "./_nav";

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    await requireAdmin();
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b px-6 py-3 flex justify-between items-center">
          <h1 className="font-semibold">Gym Admin</h1>
          <UserButton />
        </header>
        <div className="flex-1 flex">
          <AdminNav />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Update `src/app/admin/page.tsx` to a small landing placeholder**

  Replace `src/app/admin/page.tsx`:
  ```tsx
  import { requireAdminProfile } from "@/lib/auth";

  export default async function AdminHome() {
    const admin = await requireAdminProfile();
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
        <p className="text-muted-foreground">
          Use the sidebar to manage members, approvals, and plans.
        </p>
      </div>
    );
  }
  ```

- [ ] **Step 4: Smoke test**

  ```powershell
  pnpm dev
  ```
  Sign in as an admin (an email in `ADMIN_EMAILS`) → visit `/admin` → expected: see the welcome heading and a sidebar on the left with four links. Clicking each link 404s for now (Members, Pending, Plans pages come in later tasks), but the active state should highlight the current link.

  Ctrl+C.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/admin/
  git commit -m "feat: admin shell with sidebar nav (members/pending/plans)"
  ```

---

## Task 4: Plans CRUD — pure validation logic + tests

**Goal:** Before touching any UI, write the pure validation function for plan input. Pure-function tests are fast and cement the contract.

**Files:**
- Create: `src/lib/plans/validate.ts`, `tests/lib/plans-validate.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/plans-validate.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { validatePlanInput } from "@/lib/plans/validate";

  describe("validatePlanInput", () => {
    it("accepts a valid plan", () => {
      const r = validatePlanInput({ name: "Monthly", durationDays: "30", priceLkr: "5000.00" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toEqual({ name: "Monthly", durationDays: 30, priceLkr: "5000.00" });
      }
    });

    it("trims the name", () => {
      const r = validatePlanInput({ name: "  Quarterly  ", durationDays: "90", priceLkr: "12000" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.name).toBe("Quarterly");
    });

    it("rejects empty name", () => {
      const r = validatePlanInput({ name: "  ", durationDays: "30", priceLkr: "5000" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.name).toBeDefined();
    });

    it("rejects durationDays = 0 or negative", () => {
      expect(validatePlanInput({ name: "x", durationDays: "0", priceLkr: "1" }).ok).toBe(false);
      expect(validatePlanInput({ name: "x", durationDays: "-3", priceLkr: "1" }).ok).toBe(false);
    });

    it("rejects non-integer durationDays", () => {
      const r = validatePlanInput({ name: "x", durationDays: "1.5", priceLkr: "1" });
      expect(r.ok).toBe(false);
    });

    it("rejects negative priceLkr", () => {
      const r = validatePlanInput({ name: "x", durationDays: "30", priceLkr: "-1" });
      expect(r.ok).toBe(false);
    });

    it("accepts priceLkr = 0 (free trial plan)", () => {
      const r = validatePlanInput({ name: "Trial", durationDays: "7", priceLkr: "0" });
      expect(r.ok).toBe(true);
    });

    it("normalizes priceLkr to two decimal places", () => {
      const r = validatePlanInput({ name: "x", durationDays: "30", priceLkr: "5000" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.priceLkr).toBe("5000.00");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  pnpm test tests/lib/plans-validate.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/plans/validate.ts`:
  ```ts
  export type PlanInput = {
    name: string;
    durationDays: string;
    priceLkr: string;
  };

  export type ValidatedPlan = {
    name: string;
    durationDays: number;
    priceLkr: string;
  };

  export type PlanValidationResult =
    | { ok: true; value: ValidatedPlan }
    | { ok: false; errors: Partial<Record<keyof PlanInput, string>> };

  export function validatePlanInput(raw: PlanInput): PlanValidationResult {
    const errors: Partial<Record<keyof PlanInput, string>> = {};

    const name = raw.name.trim();
    if (!name) errors.name = "Name is required";

    const durationDays = Number(raw.durationDays);
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      errors.durationDays = "Duration must be a positive whole number of days";
    }

    const priceNum = Number(raw.priceLkr);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.priceLkr = "Price must be zero or positive";
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors };

    return {
      ok: true,
      value: { name, durationDays, priceLkr: priceNum.toFixed(2) },
    };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  pnpm test tests/lib/plans-validate.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/plans/validate.ts tests/lib/plans-validate.test.ts
  git commit -m "feat: add plan input validation"
  ```

---

## Task 5: Plans CRUD — server actions + integration tests

**Files:**
- Create: `src/app/admin/plans/actions.ts`, `tests/app/admin/plans-actions.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/app/admin/plans-actions.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { plans } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { createPlan, updatePlan, setPlanActive } from "@/app/admin/plans/actions";

  // The actions call requireAdminProfile() which redirects unauthenticated.
  // In unit tests, we exercise the underlying helpers via a `__test` export.
  // For now we test the un-gated helpers; the gated wrappers get a smoke test
  // in Task 10.

  import { _createPlanUnsafe, _updatePlanUnsafe, _setPlanActiveUnsafe } from "@/app/admin/plans/actions";

  const NAME = "TestPlan_xyz_phase1";

  async function cleanup() {
    await db.delete(plans).where(eq(plans.name, NAME));
  }

  describe("plan mutations (un-gated helpers)", () => {
    beforeEach(cleanup);
    afterEach(cleanup);

    it("creates a plan with valid input", async () => {
      const result = await _createPlanUnsafe({
        name: NAME,
        durationDays: "45",
        priceLkr: "7500",
      });
      expect(result.ok).toBe(true);
      const rows = await db.select().from(plans).where(eq(plans.name, NAME));
      expect(rows.length).toBe(1);
      expect(rows[0].durationDays).toBe(45);
      expect(rows[0].priceLkr).toBe("7500.00");
      expect(rows[0].isActive).toBe(true);
    });

    it("rejects invalid input without writing", async () => {
      const result = await _createPlanUnsafe({
        name: "",
        durationDays: "-1",
        priceLkr: "abc",
      });
      expect(result.ok).toBe(false);
      const rows = await db.select().from(plans).where(eq(plans.name, NAME));
      expect(rows.length).toBe(0);
    });

    it("updates an existing plan", async () => {
      const [created] = await db
        .insert(plans)
        .values({ name: NAME, durationDays: 30, priceLkr: "5000" })
        .returning();
      const r = await _updatePlanUnsafe(created.id, {
        name: NAME,
        durationDays: "60",
        priceLkr: "9000",
      });
      expect(r.ok).toBe(true);
      const [row] = await db.select().from(plans).where(eq(plans.id, created.id));
      expect(row.durationDays).toBe(60);
      expect(row.priceLkr).toBe("9000.00");
    });

    it("soft-disables a plan (sets is_active=false)", async () => {
      const [created] = await db
        .insert(plans)
        .values({ name: NAME, durationDays: 30, priceLkr: "5000" })
        .returning();
      const r = await _setPlanActiveUnsafe(created.id, false);
      expect(r.ok).toBe(true);
      const [row] = await db.select().from(plans).where(eq(plans.id, created.id));
      expect(row.isActive).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (import not found)**

  ```powershell
  pnpm test tests/app/admin/plans-actions.test.ts
  ```

- [ ] **Step 3: Implement the server actions**

  Create `src/app/admin/plans/actions.ts`:
  ```ts
  "use server";

  import { db } from "@/db";
  import { plans } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { requireAdminProfile } from "@/lib/auth";
  import { validatePlanInput, type PlanInput } from "@/lib/plans/validate";

  export type PlanActionResult =
    | { ok: true }
    | { ok: false; errors: Partial<Record<keyof PlanInput, string>> | { _form: string } };

  // ---- Un-gated helpers (test-only) ------------------------------------------
  // These exist so tests can exercise the mutation logic without a Clerk session.
  // The gated server-action wrappers below call requireAdminProfile() first.

  export async function _createPlanUnsafe(raw: PlanInput): Promise<PlanActionResult> {
    const v = validatePlanInput(raw);
    if (!v.ok) return { ok: false, errors: v.errors };
    await db.insert(plans).values({
      name: v.value.name,
      durationDays: v.value.durationDays,
      priceLkr: v.value.priceLkr,
    });
    return { ok: true };
  }

  export async function _updatePlanUnsafe(
    id: string,
    raw: PlanInput,
  ): Promise<PlanActionResult> {
    const v = validatePlanInput(raw);
    if (!v.ok) return { ok: false, errors: v.errors };
    await db
      .update(plans)
      .set({
        name: v.value.name,
        durationDays: v.value.durationDays,
        priceLkr: v.value.priceLkr,
      })
      .where(eq(plans.id, id));
    return { ok: true };
  }

  export async function _setPlanActiveUnsafe(
    id: string,
    isActive: boolean,
  ): Promise<PlanActionResult> {
    await db.update(plans).set({ isActive }).where(eq(plans.id, id));
    return { ok: true };
  }

  // ---- Gated server actions (called from forms) -------------------------------

  export async function createPlan(
    _prev: PlanActionResult | undefined,
    formData: FormData,
  ): Promise<PlanActionResult> {
    await requireAdminProfile();
    const raw: PlanInput = {
      name: String(formData.get("name") ?? ""),
      durationDays: String(formData.get("durationDays") ?? ""),
      priceLkr: String(formData.get("priceLkr") ?? ""),
    };
    const result = await _createPlanUnsafe(raw);
    if (result.ok) revalidatePath("/admin/plans");
    return result;
  }

  export async function updatePlan(
    id: string,
    _prev: PlanActionResult | undefined,
    formData: FormData,
  ): Promise<PlanActionResult> {
    await requireAdminProfile();
    const raw: PlanInput = {
      name: String(formData.get("name") ?? ""),
      durationDays: String(formData.get("durationDays") ?? ""),
      priceLkr: String(formData.get("priceLkr") ?? ""),
    };
    const result = await _updatePlanUnsafe(id, raw);
    if (result.ok) revalidatePath("/admin/plans");
    return result;
  }

  export async function setPlanActive(id: string, isActive: boolean) {
    await requireAdminProfile();
    const result = await _setPlanActiveUnsafe(id, isActive);
    if (result.ok) revalidatePath("/admin/plans");
    return result;
  }
  ```

  Note: `"use server"` files **can** export non-function values and helper functions, but every exported function is callable as a Server Action by the client. The `_createPlanUnsafe` etc. helpers are intentionally `_`-prefixed to flag "don't call from a form" — and they're tested directly, which is the only safe code path that bypasses the auth check.

  **Trade-off accepted:** The `_*Unsafe` helpers are technically reachable by a malicious client invocation. They have no auth check. They are an authorization hole **IF** the client can craft a request that hits them. In practice, Next.js Server Actions are addressable only via opaque IDs the bundler emits per closure; calling `_createPlanUnsafe` externally would require knowing its action ID, which isn't exposed via any form. We accept this for testability now; if it becomes a concern in Phase 5 hardening, add a build-time guard.

- [ ] **Step 4: Run — expect pass**

  ```powershell
  pnpm test tests/app/admin/plans-actions.test.ts
  ```

- [ ] **Step 5: Run the full suite**

  ```powershell
  pnpm test
  ```
  Expected: all green.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/admin/plans/ tests/app/admin/
  git commit -m "feat: plans server actions (create/update/setActive) with input validation"
  ```

---

## Task 6: Plans CRUD — UI

**Goal:** `/admin/plans` shows all plans (active + soft-disabled), with create / edit / disable buttons.

**Files:**
- Create:
  - `src/app/admin/plans/page.tsx`
  - `src/app/admin/plans/_plans-table.tsx` (client component)
  - `src/app/admin/plans/_plan-form.tsx` (client component, reused for create + edit)
- Modify: nothing else.

- [ ] **Step 1: Build the page (server component)**

  Create `src/app/admin/plans/page.tsx`:
  ```tsx
  import { db } from "@/db";
  import { plans } from "@/db/schema";
  import { desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import { PlansTable } from "./_plans-table";

  export default async function PlansPage() {
    await requireAdminProfile();
    const rows = await db.select().from(plans).orderBy(desc(plans.createdAt));
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Plans</h2>
        </div>
        <PlansTable plans={rows} />
      </div>
    );
  }
  ```

- [ ] **Step 2: Build the table client component with edit-in-dialog + disable toggle**

  Create `src/app/admin/plans/_plans-table.tsx`:
  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
  } from "@/components/ui/dialog";
  import { PlanForm } from "./_plan-form";
  import { setPlanActive } from "./actions";
  import { toast } from "sonner";

  type Plan = {
    id: string;
    name: string;
    durationDays: number;
    priceLkr: string;
    isActive: boolean;
  };

  export function PlansTable({ plans }: { plans: Plan[] }) {
    const [isPending, startTransition] = useTransition();
    const [editing, setEditing] = useState<Plan | null>(null);
    const [creating, setCreating] = useState(false);

    function toggleActive(p: Plan) {
      startTransition(async () => {
        const r = await setPlanActive(p.id, !p.isActive);
        if (!r.ok) toast.error("Failed to update plan");
      });
    }

    return (
      <>
        <div className="flex justify-end">
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button>New plan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create plan</DialogTitle>
              </DialogHeader>
              <PlanForm
                mode="create"
                onDone={() => {
                  setCreating(false);
                  toast.success("Plan created");
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Duration</TableHead>
              <TableHead className="w-32">Price (LKR)</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No plans yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
            {plans.map((p) => (
              <TableRow key={p.id} className={p.isActive ? "" : "opacity-60"}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.durationDays} days</TableCell>
                <TableCell>{Number(p.priceLkr).toLocaleString()}</TableCell>
                <TableCell>
                  {p.isActive ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(p)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => toggleActive(p)}
                  >
                    {p.isActive ? "Disable" : "Re-enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit plan</DialogTitle>
            </DialogHeader>
            {editing && (
              <PlanForm
                mode="edit"
                planId={editing.id}
                initial={{
                  name: editing.name,
                  durationDays: String(editing.durationDays),
                  priceLkr: editing.priceLkr,
                }}
                onDone={() => {
                  setEditing(null);
                  toast.success("Plan updated");
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }
  ```

- [ ] **Step 3: Build the form (client component, reused for create + edit)**

  Create `src/app/admin/plans/_plan-form.tsx`:
  ```tsx
  "use client";

  import { useActionState, useEffect } from "react";
  import { createPlan, updatePlan, type PlanActionResult } from "./actions";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Button } from "@/components/ui/button";

  type Props =
    | { mode: "create"; onDone: () => void; initial?: undefined; planId?: undefined }
    | {
        mode: "edit";
        planId: string;
        initial: { name: string; durationDays: string; priceLkr: string };
        onDone: () => void;
      };

  export function PlanForm(props: Props) {
    const action =
      props.mode === "create"
        ? createPlan
        : updatePlan.bind(null, props.planId);

    const [state, dispatch, pending] = useActionState<
      PlanActionResult | undefined,
      FormData
    >(action, undefined);

    useEffect(() => {
      if (state?.ok) props.onDone();
    }, [state, props]);

    const fieldErr = (k: "name" | "durationDays" | "priceLkr") =>
      state && !state.ok && "errors" in state && k in state.errors
        ? (state.errors as Record<string, string>)[k]
        : undefined;

    return (
      <form action={dispatch} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={props.initial?.name ?? ""} required />
          {fieldErr("name") && <p className="text-destructive text-sm">{fieldErr("name")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationDays">Duration (days)</Label>
          <Input
            id="durationDays"
            name="durationDays"
            type="number"
            min="1"
            step="1"
            defaultValue={props.initial?.durationDays ?? ""}
            required
          />
          {fieldErr("durationDays") && (
            <p className="text-destructive text-sm">{fieldErr("durationDays")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priceLkr">Price (LKR)</Label>
          <Input
            id="priceLkr"
            name="priceLkr"
            type="number"
            min="0"
            step="0.01"
            defaultValue={props.initial?.priceLkr ?? ""}
            required
          />
          {fieldErr("priceLkr") && (
            <p className="text-destructive text-sm">{fieldErr("priceLkr")}</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : props.mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </form>
    );
  }
  ```

- [ ] **Step 4: Wire `<Toaster />` so `toast.success/error` actually shows**

  Modify `src/app/layout.tsx` to add the Sonner Toaster inside `<body>`. Insert after `{children}`:
  ```tsx
  // ...existing imports...
  import { Toaster } from "@/components/ui/sonner";

  // ...existing component body, body should look like:
  <body className="min-h-full flex flex-col">
    {children}
    <Toaster richColors position="top-right" />
  </body>
  ```

  (Only modify the body element; do not touch the `<ClerkProvider>` or `<html>` wrappers.)

- [ ] **Step 5: Manual smoke test**

  ```powershell
  pnpm dev
  ```
  As admin → `/admin/plans` → see three seeded plans (Daily/Monthly/Annual). Click "New plan" → fill in `Quarterly, 90, 12000` → submit → dialog closes, table updates, success toast. Click "Edit" on Quarterly → change duration to `91` → submit → row reflects new value. Click "Disable" on Quarterly → row dims, badge flips to "Disabled". Click "Re-enable" → reverses. Ctrl+C.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/admin/plans/ src/app/layout.tsx
  git commit -m "feat: admin plans CRUD UI (list, create dialog, edit dialog, disable toggle)"
  ```

---

## Task 7: Member list page

**Goal:** `/admin/members` lists all profiles with role=member. Status filter (all / pending / active / inactive), text search by name or email, paginated 25 per page.

**Files:**
- Create:
  - `src/app/admin/members/page.tsx`
  - `src/app/admin/members/_filters.tsx` (client, URL-param driven)
- Modify: nothing else.

- [ ] **Step 1: Build the page**

  Create `src/app/admin/members/page.tsx`:
  ```tsx
  import Link from "next/link";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { and, eq, ilike, or, count, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { MemberFilters } from "./_filters";

  const PAGE_SIZE = 25;

  type SearchParams = {
    status?: string;
    q?: string;
    page?: string;
  };

  export default async function MembersPage({
    searchParams,
  }: {
    searchParams: Promise<SearchParams>;
  }) {
    await requireAdminProfile();
    const sp = await searchParams;

    const status = sp.status === "pending" || sp.status === "active" || sp.status === "inactive"
      ? sp.status
      : undefined;
    const q = (sp.q ?? "").trim();
    const page = Math.max(1, Number(sp.page ?? "1") || 1);

    const filters = [eq(profiles.role, "member")];
    if (status) filters.push(eq(profiles.status, status));
    if (q) {
      const pattern = `%${q}%`;
      filters.push(or(ilike(profiles.fullName, pattern), ilike(profiles.email, pattern))!);
    }
    const whereExpr = filters.length === 1 ? filters[0] : and(...filters);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(profiles)
      .where(whereExpr);

    const rows = await db
      .select()
      .from(profiles)
      .where(whereExpr)
      .orderBy(desc(profiles.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    function pageHref(p: number) {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      return qs ? `/admin/members?${qs}` : "/admin/members";
    }

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Members</h2>
        <MemberFilters status={status} q={q} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Joined</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No members match your filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.fullName}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>
                  <Badge variant={m.status === "active" ? "default" : m.status === "pending" ? "secondary" : "outline"}>
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell>{m.createdAt.toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/members/${m.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link href={pageHref(Math.min(totalPages, page + 1))}>Next</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  ```

  Note on the `<Button asChild>` calls above: shadcn v4's Button uses `@base-ui/react`'s render-prop pattern instead of `asChild`. If `<Button asChild><Link>...</Link></Button>` fails to compile (or compiles but the click does nothing — see memory note `reference_shadcn_v4_button_render`), replace each occurrence with the render-prop form:

  ```tsx
  <Button render={<Link href={pageHref(Math.max(1, page - 1))} />} variant="outline" size="sm" disabled={page <= 1}>
    Previous
  </Button>
  ```

  Apply the same replacement to every `<Button asChild>...<Link>...</Link></Button>` in this file. The subagent should try `asChild` first since the existing `home/page.tsx` doesn't use it — if it compiles AND clicking navigates, leave as-is; otherwise switch to render.

- [ ] **Step 2: Build the filters bar (client)**

  Create `src/app/admin/members/_filters.tsx`:
  ```tsx
  "use client";

  import { useRouter, useSearchParams } from "next/navigation";
  import { useState, useTransition } from "react";
  import { Input } from "@/components/ui/input";
  import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  } from "@/components/ui/select";

  export function MemberFilters({
    status,
    q,
  }: {
    status: "pending" | "active" | "inactive" | undefined;
    q: string;
  }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [text, setText] = useState(q);
    const [pending, startTransition] = useTransition();

    function update(next: { status?: string | null; q?: string | null }) {
      const params = new URLSearchParams(searchParams.toString());
      if (next.status !== undefined) {
        if (next.status === null || next.status === "all") params.delete("status");
        else params.set("status", next.status);
      }
      if (next.q !== undefined) {
        if (!next.q) params.delete("q");
        else params.set("q", next.q);
      }
      params.delete("page"); // reset to page 1
      startTransition(() => {
        const qs = params.toString();
        router.push(qs ? `/admin/members?${qs}` : "/admin/members");
      });
    }

    return (
      <div className="flex gap-3 items-center">
        <Select value={status ?? "all"} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: text });
          }}
        >
          <Input
            type="search"
            placeholder="Search name or email…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={pending}
          />
        </form>
      </div>
    );
  }
  ```

- [ ] **Step 3: Smoke test**

  ```powershell
  pnpm dev
  ```
  As admin → `/admin/members` → see the member(s) you signed up in Phase 0 testing. Try filtering by status. Try searching. Pagination should be present even with 1 row. Ctrl+C.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/app/admin/members/
  git commit -m "feat: admin member list with status filter, search, pagination"
  ```

---

## Task 8: Member detail page

**Goal:** `/admin/members/[id]` shows full profile, current membership, and membership history.

**Files:**
- Create:
  - `src/lib/memberships/current.ts` — pure helper: "given a list of memberships, which is current?" (testable)
  - `src/app/admin/members/[id]/page.tsx`
  - `tests/lib/memberships-current.test.ts`

- [ ] **Step 1: Write the failing test for `getCurrentMembership`**

  Create `tests/lib/memberships-current.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { getCurrentMembership, type MembershipForCurrentCheck } from "@/lib/memberships/current";

  const today = "2026-05-15";

  const m = (overrides: Partial<MembershipForCurrentCheck>): MembershipForCurrentCheck => ({
    id: overrides.id ?? "x",
    status: overrides.status ?? "active",
    startDate: overrides.startDate ?? "2026-01-01",
    endDate: overrides.endDate ?? "2026-12-31",
  });

  describe("getCurrentMembership", () => {
    it("returns null when no memberships", () => {
      expect(getCurrentMembership([], today)).toBeNull();
    });

    it("returns the active one with end_date >= today", () => {
      const result = getCurrentMembership(
        [m({ id: "a", status: "active", endDate: "2026-12-31" })],
        today,
      );
      expect(result?.id).toBe("a");
    });

    it("ignores expired ones (end_date < today)", () => {
      const result = getCurrentMembership(
        [m({ id: "a", status: "active", endDate: "2026-05-14" })],
        today,
      );
      expect(result).toBeNull();
    });

    it("ignores cancelled status even if end_date is in future", () => {
      const result = getCurrentMembership(
        [m({ id: "a", status: "cancelled", endDate: "2026-12-31" })],
        today,
      );
      expect(result).toBeNull();
    });

    it("picks the one with the latest end_date when multiple active overlap", () => {
      const result = getCurrentMembership(
        [
          m({ id: "a", status: "active", endDate: "2026-06-30" }),
          m({ id: "b", status: "active", endDate: "2026-09-30" }),
          m({ id: "c", status: "active", endDate: "2026-07-15" }),
        ],
        today,
      );
      expect(result?.id).toBe("b");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

  Create `src/lib/memberships/current.ts`:
  ```ts
  export type MembershipForCurrentCheck = {
    id: string;
    status: "active" | "expired" | "cancelled";
    startDate: string; // ISO date
    endDate: string; // ISO date
  };

  /**
   * "Current" membership = status='active' AND end_date >= today.
   * If multiple match, return the one with the latest end_date.
   * `today` must be a YYYY-MM-DD string in the gym's local date sense.
   */
  export function getCurrentMembership<T extends MembershipForCurrentCheck>(
    rows: T[],
    today: string,
  ): T | null {
    const eligible = rows.filter(
      (r) => r.status === "active" && r.endDate >= today,
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((latest, r) =>
      r.endDate > latest.endDate ? r : latest,
    );
  }
  ```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Build the detail page**

  Create `src/app/admin/members/[id]/page.tsx`:
  ```tsx
  import { notFound } from "next/navigation";
  import { db } from "@/db";
  import { profiles, memberships, plans } from "@/db/schema";
  import { eq, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import { getCurrentMembership } from "@/lib/memberships/current";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { format } from "date-fns";

  export default async function MemberDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    await requireAdminProfile();
    const { id } = await params;

    const [member] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!member) notFound();

    const history = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
        planDuration: plans.durationDays,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, id))
      .orderBy(desc(memberships.endDate));

    const today = format(new Date(), "yyyy-MM-dd");
    const current = getCurrentMembership(history, today);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold">{member.fullName}</h2>
            <p className="text-muted-foreground">{member.email}</p>
          </div>
          <Badge variant={member.status === "active" ? "default" : member.status === "pending" ? "secondary" : "outline"}>
            {member.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div><span className="text-muted-foreground">Phone:</span> {member.phone ?? "—"}</div>
              <div><span className="text-muted-foreground">Joined:</span> {format(member.createdAt, "PP")}</div>
              <div><span className="text-muted-foreground">Role:</span> {member.role}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Current membership</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {current ? (
                <>
                  <div className="font-medium">{current.planName}</div>
                  <div className="text-muted-foreground">
                    {format(new Date(current.startDate), "PP")} – {format(new Date(current.endDate), "PP")}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No active membership.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Membership history</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    No memberships yet.
                  </TableCell>
                </TableRow>
              )}
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.planName}</TableCell>
                  <TableCell>{format(new Date(h.startDate), "PP")}</TableCell>
                  <TableCell>{format(new Date(h.endDate), "PP")}</TableCell>
                  <TableCell>
                    <Badge variant={h.status === "active" ? "default" : "outline"}>{h.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 6: Run the full suite**

  ```powershell
  pnpm test
  ```
  Expected: green including new membership-current test.

- [ ] **Step 7: Smoke test**

  Click "View" on any row in `/admin/members`. Verify the detail page renders (Current membership will say "No active membership" since we haven't approved anyone yet — that's correct).

- [ ] **Step 8: Commit**

  ```powershell
  git add src/app/admin/members/ src/lib/memberships/ tests/lib/memberships-current.test.ts
  git commit -m "feat: admin member detail page with current membership and history"
  ```

---

## Task 9: Approval flow — pure date math + tests

**Goal:** Compute the membership window for a new approval, in isolation, before wiring it into a transaction. Date math has historically been the bug source in gym apps.

**Files:**
- Create: `src/lib/memberships/window.ts`, `tests/lib/memberships-window.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/memberships-window.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { computeMembershipWindow } from "@/lib/memberships/window";

  describe("computeMembershipWindow", () => {
    it("30-day plan starting today", () => {
      const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 30 });
      expect(w.startDate).toBe("2026-05-15");
      expect(w.endDate).toBe("2026-06-13");
    });

    it("1-day daily pass", () => {
      const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 1 });
      expect(w.startDate).toBe("2026-05-15");
      expect(w.endDate).toBe("2026-05-15");
    });

    it("365-day annual plan", () => {
      const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 365 });
      expect(w.startDate).toBe("2026-05-15");
      expect(w.endDate).toBe("2027-05-14");
    });

    it("rolls over month boundaries", () => {
      const w = computeMembershipWindow({ today: "2026-01-31", durationDays: 30 });
      expect(w.endDate).toBe("2026-03-01");
    });

    it("rolls over year boundaries", () => {
      const w = computeMembershipWindow({ today: "2026-12-20", durationDays: 30 });
      expect(w.endDate).toBe("2027-01-18");
    });

    it("respects an explicit start date later than today (renewal stacking)", () => {
      const w = computeMembershipWindow({
        today: "2026-05-15",
        startOn: "2026-06-01",
        durationDays: 30,
      });
      expect(w.startDate).toBe("2026-06-01");
      expect(w.endDate).toBe("2026-06-30");
    });

    it("clamps startOn to today if startOn is in the past", () => {
      const w = computeMembershipWindow({
        today: "2026-05-15",
        startOn: "2026-01-01",
        durationDays: 30,
      });
      expect(w.startDate).toBe("2026-05-15");
    });
  });
  ```

  **Note on the convention:** A 30-day plan that starts on 2026-05-15 ends on 2026-06-13, *inclusive*. That is, the member's last covered day is 2026-06-13; on 2026-06-14 they must renew. `end_date - start_date + 1 = durationDays`. This matches how a brick-and-mortar gym thinks about "30 days of access starting today."

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

  Create `src/lib/memberships/window.ts`:
  ```ts
  import { addDays, format, parseISO } from "date-fns";

  export type WindowInput = {
    today: string; // YYYY-MM-DD
    durationDays: number; // positive integer
    startOn?: string; // YYYY-MM-DD, optional; clamped to >= today
  };

  export type WindowResult = {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD (inclusive last day)
  };

  export function computeMembershipWindow(input: WindowInput): WindowResult {
    const todayDate = parseISO(input.today);
    let startDate = todayDate;
    if (input.startOn) {
      const requested = parseISO(input.startOn);
      if (requested > todayDate) startDate = requested;
    }
    // Inclusive: a 1-day plan starting today ends today.
    const endDate = addDays(startDate, input.durationDays - 1);
    return {
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };
  }
  ```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/memberships/window.ts tests/lib/memberships-window.test.ts
  git commit -m "feat: add membership-window date math helper"
  ```

---

## Task 10: Approval flow — server action + integration test

**Goal:** "Approve member" atomically: insert one `memberships` row + flip `profiles.status='active'` + mirror `status='active'` to Clerk `publicMetadata`. Phase 1 explicitly does **not** create a `payments` row (Phase 2).

**Files:**
- Create:
  - `src/app/admin/pending/actions.ts`
  - `tests/app/admin/pending-actions.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/app/admin/pending-actions.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { _approveMemberUnsafe } from "@/app/admin/pending/actions";

  const MEMBER_CLERK_ID = "user_pending_test_member";
  const ADMIN_CLERK_ID = "user_pending_test_admin";
  const PLAN_NAME = "TestPlan_pending_phase1";

  let memberId: string;
  let adminId: string;
  let planId: string;

  async function clean() {
    // children first
    const [mp] = await db.select().from(profiles).where(eq(profiles.clerkUserId, MEMBER_CLERK_ID));
    if (mp) await db.delete(memberships).where(eq(memberships.memberId, mp.id));
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db.delete(profiles).where(eq(profiles.clerkUserId, MEMBER_CLERK_ID));
    await db.delete(profiles).where(eq(profiles.clerkUserId, ADMIN_CLERK_ID));
  }

  beforeEach(async () => {
    await clean();
    const [m] = await db
      .insert(profiles)
      .values({ clerkUserId: MEMBER_CLERK_ID, email: "m@x.lk", fullName: "Pending M", role: "member", status: "pending" })
      .returning();
    memberId = m.id;
    const [a] = await db
      .insert(profiles)
      .values({ clerkUserId: ADMIN_CLERK_ID, email: "a@x.lk", fullName: "Admin A", role: "admin", status: "active" })
      .returning();
    adminId = a.id;
    const [p] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    planId = p.id;
  });

  afterEach(clean);

  describe("approveMember", () => {
    it("flips status to active and inserts one membership", async () => {
      const r = await _approveMemberUnsafe({
        memberId,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(true);

      const [profile] = await db.select().from(profiles).where(eq(profiles.id, memberId));
      expect(profile.status).toBe("active");

      const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
      expect(mems.length).toBe(1);
      expect(mems[0].planId).toBe(planId);
      expect(mems[0].status).toBe("active");
      expect(mems[0].createdBy).toBe(adminId);
      expect(mems[0].startDate).toBe("2026-05-15");
      expect(mems[0].endDate).toBe("2026-06-13"); // inclusive 30 days
    });

    it("rejects approving a member who is already active", async () => {
      await db.update(profiles).set({ status: "active" }).where(eq(profiles.id, memberId));
      const r = await _approveMemberUnsafe({
        memberId,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      const mems = await db.select().from(memberships).where(eq(memberships.memberId, memberId));
      expect(mems.length).toBe(0);
    });

    it("rejects approving with a non-existent plan", async () => {
      const r = await _approveMemberUnsafe({
        memberId,
        planId: "00000000-0000-0000-0000-000000000000",
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(false);
    });

    it("rejects approving with a disabled plan", async () => {
      await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
      const r = await _approveMemberUnsafe({
        memberId,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (import not found)**

- [ ] **Step 3: Implement**

  Create `src/app/admin/pending/actions.ts`:
  ```ts
  "use server";

  import { db } from "@/db";
  import { profiles, plans, memberships } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { clerkClient } from "@clerk/nextjs/server";
  import { format } from "date-fns";
  import { requireAdminProfile } from "@/lib/auth";
  import { computeMembershipWindow } from "@/lib/memberships/window";

  export type ApproveInput = {
    memberId: string;
    planId: string;
    approvedByProfileId: string;
    today: string; // YYYY-MM-DD
  };

  export type ApproveResult = { ok: true } | { ok: false; error: string };

  /**
   * Test-only helper: no auth gate, no Clerk metadata sync.
   * Phase 1 NOTE: this does NOT insert a payments row. Approval here means
   * "I trust this person and gave them a plan" — payment recording is Phase 2.
   */
  export async function _approveMemberUnsafe(input: ApproveInput): Promise<ApproveResult> {
    const [member] = await db.select().from(profiles).where(eq(profiles.id, input.memberId)).limit(1);
    if (!member) return { ok: false, error: "Member not found" };
    if (member.status === "active") return { ok: false, error: "Member is already active" };

    const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (!plan) return { ok: false, error: "Plan not found" };
    if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

    const window = computeMembershipWindow({
      today: input.today,
      durationDays: plan.durationDays,
    });

    await db.transaction(async (tx) => {
      await tx.insert(memberships).values({
        memberId: input.memberId,
        planId: input.planId,
        startDate: window.startDate,
        endDate: window.endDate,
        status: "active",
        createdBy: input.approvedByProfileId,
      });
      await tx
        .update(profiles)
        .set({ status: "active" })
        .where(eq(profiles.id, input.memberId));
    });

    return { ok: true };
  }

  /**
   * Server-action wrapper called from the pending-approvals UI.
   * Calls requireAdminProfile() and mirrors status to Clerk publicMetadata.
   */
  export async function approveMember(
    _prev: ApproveResult | undefined,
    formData: FormData,
  ): Promise<ApproveResult> {
    const admin = await requireAdminProfile();
    const memberId = String(formData.get("memberId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    if (!memberId || !planId) return { ok: false, error: "memberId and planId required" };

    const today = format(new Date(), "yyyy-MM-dd");
    const result = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: admin.id,
      today,
    });

    if (result.ok) {
      // Mirror status to Clerk metadata so the middleware sees it on next request.
      const [member] = await db.select().from(profiles).where(eq(profiles.id, memberId)).limit(1);
      if (member) {
        const client = await clerkClient();
        await client.users.updateUserMetadata(member.clerkUserId, {
          publicMetadata: { role: member.role, status: "active" },
        });
      }
      revalidatePath("/admin/pending");
      revalidatePath("/admin/members");
      revalidatePath(`/admin/members/${memberId}`);
    }

    return result;
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  pnpm test tests/app/admin/pending-actions.test.ts
  ```

- [ ] **Step 5: Run full suite**

  ```powershell
  pnpm test
  ```

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/admin/pending/ tests/app/admin/pending-actions.test.ts
  git commit -m "feat: approve-member server action with atomic membership insert + status flip"
  ```

---

## Task 11: Pending approvals queue — UI

**Goal:** `/admin/pending` lists members with `status='pending'`. Each row has an "Approve" button that opens a dialog with a plan picker, then triggers the action from Task 10.

**Files:**
- Create:
  - `src/app/admin/pending/page.tsx`
  - `src/app/admin/pending/_approve-button.tsx` (client)

- [ ] **Step 1: Build the page**

  Create `src/app/admin/pending/page.tsx`:
  ```tsx
  import { db } from "@/db";
  import { profiles, plans } from "@/db/schema";
  import { and, eq, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { format } from "date-fns";
  import { ApproveButton } from "./_approve-button";

  export default async function PendingPage() {
    await requireAdminProfile();
    const pending = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.role, "member"), eq(profiles.status, "pending")))
      .orderBy(desc(profiles.createdAt));

    const activePlans = await db
      .select({ id: plans.id, name: plans.name, durationDays: plans.durationDays, priceLkr: plans.priceLkr })
      .from(plans)
      .where(eq(plans.isActive, true));

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Pending approvals</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-40">Signed up</TableHead>
              <TableHead className="w-40 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No pending approvals.
                </TableCell>
              </TableRow>
            )}
            {pending.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.fullName}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>{format(m.createdAt, "PP")}</TableCell>
                <TableCell className="text-right">
                  <ApproveButton
                    memberId={m.id}
                    memberName={m.fullName}
                    plans={activePlans}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  ```

- [ ] **Step 2: Build the approve button + dialog (client)**

  Create `src/app/admin/pending/_approve-button.tsx`:
  ```tsx
  "use client";

  import { useState, useActionState, useEffect } from "react";
  import { approveMember, type ApproveResult } from "./actions";
  import { Button } from "@/components/ui/button";
  import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  } from "@/components/ui/dialog";
  import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  } from "@/components/ui/select";
  import { Label } from "@/components/ui/label";
  import { toast } from "sonner";

  type PlanOption = { id: string; name: string; durationDays: number; priceLkr: string };

  export function ApproveButton({
    memberId,
    memberName,
    plans,
  }: {
    memberId: string;
    memberName: string;
    plans: PlanOption[];
  }) {
    const [open, setOpen] = useState(false);
    const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");
    const [state, dispatch, pending] = useActionState<ApproveResult | undefined, FormData>(
      approveMember,
      undefined,
    );

    useEffect(() => {
      if (state?.ok) {
        toast.success(`Approved ${memberName}`);
        setOpen(false);
      } else if (state && !state.ok) {
        toast.error(state.error);
      }
    }, [state, memberName]);

    return (
      <>
        <Button size="sm" onClick={() => setOpen(true)}>
          Approve
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve {memberName}</DialogTitle>
              <DialogDescription>
                Pick the plan this member is starting on. Their membership will begin today.
                No payment is recorded in this step — record it from the member's detail page after Phase 2 ships.
              </DialogDescription>
            </DialogHeader>
            <form action={dispatch} className="space-y-4">
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="planId" value={planId} />
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.durationDays}d — LKR {Number(p.priceLkr).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={pending || !planId}>
                  {pending ? "Approving…" : "Approve"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  ```

- [ ] **Step 3: Smoke test the full happy path**

  ```powershell
  pnpm dev
  ```
  Sign out → sign up a brand-new member with a non-admin email → confirm they land on `/portal`. (The portal page will still be the Phase 0 placeholder; Task 12 replaces it.)
  Sign out → sign in as admin → `/admin/pending` → see the new member → click Approve → pick a plan → submit → toast appears → row disappears from pending list.
  Visit `/admin/members/<that id>` → status shows "active", current membership shows the plan, history table has one row.
  Ctrl+C.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/app/admin/pending/
  git commit -m "feat: pending approvals UI with plan picker + approve button"
  ```

---

## Task 12: Member portal — status-aware landing page

**Goal:** `/portal` renders one of three states based on `profiles.status`:
- **pending** — friendly "awaiting approval" screen, no QR, no nav to other pages.
- **active** — show current membership card (plan name, end date, days remaining).
- **inactive** — "Please reactivate at the front desk" screen.

**Files:**
- Modify: `src/app/portal/page.tsx`
- Create: `src/lib/days-remaining.ts`, `tests/lib/days-remaining.test.ts`

- [ ] **Step 1: Write the failing test for days-remaining**

  Create `tests/lib/days-remaining.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { daysRemaining } from "@/lib/days-remaining";

  describe("daysRemaining", () => {
    it("0 when end_date equals today (last day inclusive)", () => {
      expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-15" })).toBe(0);
    });
    it("1 when end_date is tomorrow", () => {
      expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-16" })).toBe(1);
    });
    it("30 for a 30-day plan that started today", () => {
      // start=2026-05-15, end=2026-06-13 (inclusive 30 days)
      expect(daysRemaining({ today: "2026-05-15", endDate: "2026-06-13" })).toBe(29);
    });
    it("negative when end_date is in the past", () => {
      expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-14" })).toBe(-1);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement**

  Create `src/lib/days-remaining.ts`:
  ```ts
  import { differenceInCalendarDays, parseISO } from "date-fns";

  /**
   * Whole calendar days from `today` to `endDate`, inclusive.
   * - end_date == today → 0 days remaining (last day of access).
   * - end_date == today+1 → 1 day remaining.
   * - end_date < today → negative (expired).
   */
  export function daysRemaining({
    today,
    endDate,
  }: {
    today: string;
    endDate: string;
  }): number {
    return differenceInCalendarDays(parseISO(endDate), parseISO(today));
  }
  ```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Build the portal landing page**

  Replace `src/app/portal/page.tsx`:
  ```tsx
  import { requireMemberProfile } from "@/lib/auth";
  import { db } from "@/db";
  import { memberships, plans } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { format } from "date-fns";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { getCurrentMembership } from "@/lib/memberships/current";
  import { daysRemaining } from "@/lib/days-remaining";

  export default async function PortalHome() {
    const me = await requireMemberProfile();

    if (me.status === "pending") {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Welcome, {me.fullName} 👋</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your account is awaiting approval. The gym staff will activate your
              membership shortly — you can come back to this page after.
            </p>
            <p>If you need to talk to someone, visit the front desk.</p>
          </CardContent>
        </Card>
      );
    }

    if (me.status === "inactive") {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Welcome back, {me.fullName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your account is currently inactive (no recent visits). Please drop by
              the front desk and we'll reactivate your membership.
            </p>
          </CardContent>
        </Card>
      );
    }

    // Active member: show current membership.
    const history = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, me.id));

    const today = format(new Date(), "yyyy-MM-dd");
    const current = getCurrentMembership(history, today);

    return (
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold">Welcome, {me.fullName}</h2>
        {current ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{current.planName}</span>
                <Badge>{current.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Valid:</span>{" "}
                {format(new Date(current.startDate), "PP")} – {format(new Date(current.endDate), "PP")}
              </div>
              <div>
                <span className="text-muted-foreground">Days remaining:</span>{" "}
                {Math.max(0, daysRemaining({ today, endDate: current.endDate }))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No active membership</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Please visit the front desk to renew, or wait for the online payment
              option (coming soon).
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 6: Smoke test all three states**

  ```powershell
  pnpm dev
  ```
  - **Pending:** sign up a new account, before any approval, visit `/portal` → see "awaiting approval".
  - **Active:** sign in as the member you approved in Task 11 → see plan card with days remaining.
  - **Inactive:** in Supabase SQL editor, run `update profiles set status='inactive' where email='<the active test member>';` then refresh `/portal` → see "reactivate at front desk". Flip it back to `active` afterwards.

  Ctrl+C.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/portal/page.tsx src/lib/days-remaining.ts tests/lib/days-remaining.test.ts
  git commit -m "feat: status-aware member portal landing (pending/active/inactive)"
  ```

---

## Task 13: Member portal — profile page (edit name + phone)

**Goal:** `/portal/profile` lets the signed-in member view and edit their own profile. Email is owned by Clerk and not editable here.

**Files:**
- Create:
  - `src/lib/profile/validate.ts`
  - `src/app/portal/profile/page.tsx`
  - `src/app/portal/profile/actions.ts`
  - `src/app/portal/profile/_form.tsx`
  - `tests/lib/profile-validate.test.ts`
  - `tests/app/portal/profile-actions.test.ts`
- Modify: `src/app/portal/layout.tsx` (add a small nav: Home / Profile)

- [ ] **Step 1: Failing test for validation**

  Create `tests/lib/profile-validate.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { validateProfileEdit } from "@/lib/profile/validate";

  describe("validateProfileEdit", () => {
    it("accepts a valid name + Sri Lanka phone", () => {
      const r = validateProfileEdit({ fullName: "Kasun Perera", phone: "0771234567" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.fullName).toBe("Kasun Perera");
        expect(r.value.phone).toBe("0771234567");
      }
    });
    it("trims the name", () => {
      const r = validateProfileEdit({ fullName: "  Kasun  ", phone: "0771234567" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.fullName).toBe("Kasun");
    });
    it("rejects empty name", () => {
      expect(validateProfileEdit({ fullName: " ", phone: "0771234567" }).ok).toBe(false);
    });
    it("allows empty phone (sets to null)", () => {
      const r = validateProfileEdit({ fullName: "Kasun", phone: "" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.phone).toBeNull();
    });
    it("rejects nonsense phone", () => {
      expect(validateProfileEdit({ fullName: "x", phone: "abc" }).ok).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Implement validation**

  Create `src/lib/profile/validate.ts`:
  ```ts
  export type ProfileEditInput = { fullName: string; phone: string };

  export type ProfileEditResult =
    | { ok: true; value: { fullName: string; phone: string | null } }
    | { ok: false; errors: Partial<Record<keyof ProfileEditInput, string>> };

  export function validateProfileEdit(raw: ProfileEditInput): ProfileEditResult {
    const errors: Partial<Record<keyof ProfileEditInput, string>> = {};
    const fullName = raw.fullName.trim();
    if (!fullName) errors.fullName = "Name is required";

    const phoneRaw = raw.phone.trim();
    let phone: string | null = null;
    if (phoneRaw) {
      // Accept Sri Lankan phone formats: 10 digits starting 0, or +94 followed by 9 digits.
      const digits = phoneRaw.replace(/[\s-]/g, "");
      if (/^0\d{9}$/.test(digits) || /^\+94\d{9}$/.test(digits)) {
        phone = digits;
      } else {
        errors.phone = "Enter a valid Sri Lankan phone (07XXXXXXXX or +94XXXXXXXXX)";
      }
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, value: { fullName, phone } };
  }
  ```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Failing integration test for the action**

  Create `tests/app/portal/profile-actions.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { _updateMyProfileUnsafe } from "@/app/portal/profile/actions";

  const CLERK_ID = "user_profile_action_test";

  async function clean() {
    await db.delete(profiles).where(eq(profiles.clerkUserId, CLERK_ID));
  }

  beforeEach(clean);
  afterEach(clean);

  describe("_updateMyProfileUnsafe", () => {
    it("updates fullName and phone for the signed-in member", async () => {
      const [me] = await db
        .insert(profiles)
        .values({ clerkUserId: CLERK_ID, email: "x@x.lk", fullName: "Old Name", role: "member", status: "active" })
        .returning();
      const r = await _updateMyProfileUnsafe(me.id, { fullName: "New Name", phone: "0771234567" });
      expect(r.ok).toBe(true);
      const [row] = await db.select().from(profiles).where(eq(profiles.id, me.id));
      expect(row.fullName).toBe("New Name");
      expect(row.phone).toBe("0771234567");
    });

    it("rejects invalid input without writing", async () => {
      const [me] = await db
        .insert(profiles)
        .values({ clerkUserId: CLERK_ID, email: "x@x.lk", fullName: "Old Name", role: "member", status: "active" })
        .returning();
      const r = await _updateMyProfileUnsafe(me.id, { fullName: "", phone: "abc" });
      expect(r.ok).toBe(false);
      const [row] = await db.select().from(profiles).where(eq(profiles.id, me.id));
      expect(row.fullName).toBe("Old Name");
    });
  });
  ```

- [ ] **Step 6: Run — expect failure**

- [ ] **Step 7: Implement the action**

  Create `src/app/portal/profile/actions.ts`:
  ```ts
  "use server";

  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq, sql } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { requireMemberProfile } from "@/lib/auth";
  import { validateProfileEdit, type ProfileEditInput } from "@/lib/profile/validate";

  export type ProfileActionResult =
    | { ok: true }
    | { ok: false; errors: Partial<Record<keyof ProfileEditInput, string>> };

  export async function _updateMyProfileUnsafe(
    profileId: string,
    raw: ProfileEditInput,
  ): Promise<ProfileActionResult> {
    const v = validateProfileEdit(raw);
    if (!v.ok) return { ok: false, errors: v.errors };
    await db
      .update(profiles)
      .set({ fullName: v.value.fullName, phone: v.value.phone, updatedAt: sql`now()` })
      .where(eq(profiles.id, profileId));
    return { ok: true };
  }

  export async function updateMyProfile(
    _prev: ProfileActionResult | undefined,
    formData: FormData,
  ): Promise<ProfileActionResult> {
    const me = await requireMemberProfile();
    const raw: ProfileEditInput = {
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    };
    const result = await _updateMyProfileUnsafe(me.id, raw);
    if (result.ok) {
      revalidatePath("/portal/profile");
      revalidatePath("/portal");
    }
    return result;
  }
  ```

- [ ] **Step 8: Run tests — expect pass**

  ```powershell
  pnpm test
  ```

- [ ] **Step 9: Build the profile page (server component)**

  Create `src/app/portal/profile/page.tsx`:
  ```tsx
  import { requireMemberProfile } from "@/lib/auth";
  import { ProfileForm } from "./_form";

  export default async function ProfilePage() {
    const me = await requireMemberProfile();
    return (
      <div className="max-w-md space-y-6">
        <h2 className="text-2xl font-semibold">Your profile</h2>
        <p className="text-sm text-muted-foreground">
          Email is managed by your sign-in account. To change it, sign in to your account
          and update it there.
        </p>
        <ProfileForm
          initial={{ fullName: me.fullName, phone: me.phone ?? "" }}
          email={me.email}
        />
      </div>
    );
  }
  ```

- [ ] **Step 10: Build the form (client)**

  Create `src/app/portal/profile/_form.tsx`:
  ```tsx
  "use client";

  import { useActionState, useEffect } from "react";
  import { updateMyProfile, type ProfileActionResult } from "./actions";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Button } from "@/components/ui/button";
  import { toast } from "sonner";

  export function ProfileForm({
    initial,
    email,
  }: {
    initial: { fullName: string; phone: string };
    email: string;
  }) {
    const [state, dispatch, pending] = useActionState<ProfileActionResult | undefined, FormData>(
      updateMyProfile,
      undefined,
    );

    useEffect(() => {
      if (state?.ok) toast.success("Profile saved");
    }, [state]);

    const err = (k: "fullName" | "phone") =>
      state && !state.ok ? state.errors[k] : undefined;

    return (
      <form action={dispatch} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={initial.fullName} required />
          {err("fullName") && <p className="text-destructive text-sm">{err("fullName")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initial.phone} placeholder="07XXXXXXXX" />
          {err("phone") && <p className="text-destructive text-sm">{err("phone")}</p>}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    );
  }
  ```

- [ ] **Step 11: Add a small portal nav**

  Modify `src/app/portal/layout.tsx`:
  ```tsx
  import Link from "next/link";
  import { requireMember } from "@/lib/auth";
  import { UserButton } from "@clerk/nextjs";

  export default async function PortalLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    await requireMember();
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="font-semibold">My Gym</h1>
            <nav className="flex gap-4 text-sm">
              <Link href="/portal" className="hover:underline">Home</Link>
              <Link href="/portal/profile" className="hover:underline">Profile</Link>
            </nav>
          </div>
          <UserButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }
  ```

- [ ] **Step 12: Smoke test**

  Sign in as the active member → visit `/portal/profile` → change name to "Test User Edited" and phone to `0771234567` → submit → toast appears, refresh shows new values. Try invalid phone (`abc`) → field error displays, name unchanged on retry. Refresh `/portal` and confirm the header / display name reflects the new value.

- [ ] **Step 13: Commit**

  ```powershell
  git add src/app/portal/ src/lib/profile/ tests/lib/profile-validate.test.ts tests/app/portal/
  git commit -m "feat: member profile page with name + phone edit"
  ```

---

## Task 14: Role-aware home page redirect

**Goal:** When a signed-in user lands on `/`, redirect them to `/admin` or `/portal` based on role. Signed-out users keep seeing the landing page.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update the home page**

  Replace `src/app/page.tsx`:
  ```tsx
  import Link from "next/link";
  import { redirect } from "next/navigation";
  import { buttonVariants } from "@/components/ui/button";
  import { getCurrentUser } from "@/lib/auth";

  export default async function Home() {
    const u = await getCurrentUser();
    if (u) {
      redirect(u.role === "admin" ? "/admin" : "/portal");
    }
    return (
      <main className="min-h-screen flex flex-col gap-4 items-center justify-center">
        <h1 className="text-3xl font-semibold">Gym Management</h1>
        <div className="flex gap-3">
          <Link href="/sign-in" className={buttonVariants({})}>
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({ variant: "outline" })}
          >
            Sign up
          </Link>
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 2: Smoke test**

  Sign out, hit `/` → landing page. Sign in as admin → automatically routed to `/admin`. Sign out, sign in as member → automatically routed to `/portal`.

- [ ] **Step 3: Commit**

  ```powershell
  git add src/app/page.tsx
  git commit -m "feat: redirect signed-in users from / to role-appropriate landing"
  ```

---

## Task 15: Full local end-to-end + deploy + tag

**Goal:** Walk the entire Phase 1 flow against the **live URL**, then tag the phase.

- [ ] **Step 1: Local end-to-end smoke**

  ```powershell
  pnpm test
  ```
  Expected: all green (role-decision, profile, schema, clerk-webhook, plans-validate, plans-actions, memberships-current, memberships-window, days-remaining, pending-actions, profile-validate, profile-actions).

  ```powershell
  pnpm build
  ```
  Expected: build succeeds with no type errors.

- [ ] **Step 2: Push to main**

  ```powershell
  git push
  ```

- [ ] **Step 3: Wait for CF Workers Build**

  Watch the Cloudflare Workers Build for the muscle-factory-gym project. Expected: build succeeds in ~3–5 min. If it fails, **stop and diagnose the actual error** before pushing any speculative fix (see memory `feedback_diagnose_dont_predict`).

- [ ] **Step 4: Live URL end-to-end test**

  At `https://muscle-factory-gym.kha-akashanadeel.workers.dev` in a fresh incognito window:

  1. Hit `/` while signed out → landing page renders.
  2. Click "Sign up" → create a new account with a non-admin email (e.g., `+phase1-live@gmail.com` alias).
  3. After signup → **redirected to `/portal`** (not `/`) — this confirms Task 0's fix held in production.
  4. `/portal` shows "awaiting approval".
  5. Sign out → sign in with the admin email (`ADMIN_EMAILS`).
  6. Land on `/admin`. Navigate to **Pending** → see the new member.
  7. Click **Approve** → select Monthly → submit.
  8. Navigate to **Members** → click the new member → detail page shows status `active` with one membership.
  9. Sign out → sign in as the member again.
  10. `/portal` now shows the plan card with days remaining.
  11. Visit `/portal/profile` → edit name → save → refresh, change persists.
  12. Navigate to **Plans** as admin → create a `Quarterly` plan → disable it → re-enable. Verify the dialog flows.

- [ ] **Step 5: Tag the milestone**

  ```powershell
  git tag -a phase-1 -m "Phase 1 complete: member signup → approval → portal active state working on live URL"
  git push origin phase-1
  ```

- [ ] **Step 6: If anything is dirty, commit it**

  ```powershell
  git status
  ```
  Commit any leftover config:
  ```powershell
  git add .
  git commit -m "chore: phase 1 final cleanup"
  git push
  ```

---

## Phase 1 — Definition of done

- [ ] Post-sign-in redirects to `/portal` (or `/admin` for admin) on the **live URL** — Task 0 fix held in production.
- [ ] `/admin` shows sidebar nav with Dashboard / Members / Pending / Plans.
- [ ] Admin can list, create, edit, and soft-disable plans at `/admin/plans`.
- [ ] Admin can list members at `/admin/members` with status filter, name/email search, and pagination.
- [ ] Admin can view member detail at `/admin/members/[id]` with current membership and history.
- [ ] Admin can approve pending members at `/admin/pending`: pick a plan, click Approve → status flips to `active`, one `memberships` row inserted, no payment row written, success toast appears.
- [ ] `/portal` renders pending / active / inactive states correctly based on `profiles.status`.
- [ ] Member can edit name + phone at `/portal/profile` (email read-only).
- [ ] Signed-in users hitting `/` are redirected to their role landing.
- [ ] `pnpm test` passes (every new test from this phase is green).
- [ ] Git tag `phase-1` exists on the remote.

---

## What's next

**Phase 2 — Payments (manual first).** Write the Phase 2 plan after Phase 1 is tagged and live. It will introduce: admin "Record payment" form on member detail; member-portal dues + payment history; monthly revenue / by-method breakdown report. It will also retrofit the approval action to optionally write a `payments` row in the same transaction (the `_approveMemberUnsafe` helper accepts an extension here without changing its signature). PayHere stays in Phase 4.
