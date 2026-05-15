# Phase 3 — QR Check-in / Kiosk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public `/checkin` kiosk page on a front-desk laptop where members type a 4-digit Gym ID and have their attendance marked automatically. Also ship a stub `/api/checkin/scan` endpoint for a future mobile app that scans a rotating HMAC-signed QR shown on the kiosk. Attendance history visible on both admin member-detail and member portal.

**Architecture:** Replaces design §4.4 with the kiosk model (see `docs/plans/2026-05-15-phase-3-qr-checkin-design.md`). Adds `profiles.gym_id` (auto-assigned at approval), extends `attendance.source` with `'kiosk_id'`, ships a pure-logic eligibility evaluator + a thin server-action that wraps it, and a Web-Crypto-based HMAC helper for the kiosk QR token. Phase 1's `_*Unsafe` testable-helper pattern continues.

**Tech Stack:** Same as Phase 2 — Next.js 15 (App Router), React 19 + `useActionState`, TypeScript, Tailwind v4, shadcn v4 (base-ui), Clerk v7, Drizzle ORM, `postgres` driver, Supabase Postgres, Vitest 4. Package manager: **npm**. One new runtime dep: `qrcode` (client-side QR rendering on the kiosk). HMAC uses Web Crypto API (`globalThis.crypto.subtle`), CF Workers / Node 18+ compatible — no extra dep.

**Reference design:** `docs/plans/2026-05-15-phase-3-qr-checkin-design.md`.
**Reference Phase 2:** `docs/superpowers/plans/2026-05-15-phase-2-payments.md` (especially the `_*Unsafe` pattern from Task 3 and the schema migration flow from Task 1).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell**.
- Every Task ends with one `git commit`.
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- DB-touching tests use the `phase3_test_*` prefix on clerk_user_id / plan names / etc., clean up before+after each test, following the pattern from `tests/app/admin/payments-actions.test.ts`.
- "Today" everywhere is the SL local date via `todayInSL()` from `src/lib/tz.ts`.
- `_*Unsafe` helper convention continues: every server-action file exports both an un-gated `_*Unsafe` function (tested directly against the DB) and a gated wrapper. For the kiosk submission, the "gate" is just `'use server'` because `/checkin` is intentionally public — there is no `requireAdminProfile()` call. The wrapper still does input validation + `revalidatePath`.

---

## Environment variable

Add to `.env.local` (and `.env.example` if present) before Task 0:

```
QR_SECRET=dev-only-replace-me-with-a-32-byte-random-string
```

In production this must be set to a long random string. Use `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` to generate one.

---

## File structure (new and modified)

```
src/
  lib/
    qr/
      token.ts                              (NEW — Task 0: HMAC sign/verify)
    checkin/
      evaluate.ts                           (NEW — Task 3a: pure eligibility logic)
      record.ts                             (NEW — Task 3b: DB-touching helper)
    gym-id.ts                               (NEW — Task 2: assignNextGymId)
  db/
    schema.ts                               (MODIFY — Task 1: gym_id col, kiosk_id enum value)
  middleware.ts                             (no change — /checkin already passes through)
  app/
    checkin/
      page.tsx                              (NEW — Task 5: kiosk page, public)
      _form.tsx                             (NEW — Task 5: Gym ID form + result card)
      _kiosk-qr.tsx                         (NEW — Task 5: rotating QR client component)
      actions.ts                            (NEW — Task 5: submitGymId, getFreshKioskToken)
    api/
      checkin/
        scan/
          route.ts                          (NEW — Task 6: mobile-app endpoint)
    admin/
      pending/
        actions.ts                          (MODIFY — Task 4: assign gym_id atomically)
      members/
        [id]/
          page.tsx                          (MODIFY — Task 7: Attendance section + Gym ID display)
          _attendance-table.tsx             (NEW — Task 7)
    portal/
      page.tsx                              (MODIFY — Task 8: Attendance section + Gym ID)

tests/
  lib/
    qr-token.test.ts                        (NEW — Task 0)
    gym-id.test.ts                          (NEW — Task 2)
    checkin-evaluate.test.ts                (NEW — Task 3a)
    checkin-record.test.ts                  (NEW — Task 3b)
  app/
    admin/
      pending-actions-with-gym-id.test.ts   (NEW — Task 4)
    checkin/
      submit-gym-id.test.ts                 (NEW — Task 5)
      scan-route.test.ts                    (NEW — Task 6)

drizzle/
  0003_*.sql                                (generated in Task 1)
```

---

## Task 0: QR HMAC token — `signKioskToken` / `verifyKioskToken`

**Why:** The kiosk QR must be unguessable + replay-windowed. We use HMAC-SHA256 via Web Crypto API (works identically on Node 18+, Vitest, and Cloudflare Workers). Token format is `kioskId.iat.sigBase64Url` — three URL-safe segments, easy to embed in a QR.

**Files:**
- Create: `src/lib/qr/token.ts`
- Create: `tests/lib/qr-token.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/qr-token.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { signKioskToken, verifyKioskToken } from "@/lib/qr/token";

  const SECRET = "test-secret-dev-only-never-use-in-prod";

  describe("signKioskToken / verifyKioskToken", () => {
    it("verifies a fresh token signed with the same secret", async () => {
      const now = new Date("2026-05-15T12:00:00Z");
      const token = await signKioskToken({
        kioskId: "main",
        now,
        secret: SECRET,
      });
      const result = await verifyKioskToken({
        token,
        now,
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kioskId).toBe("main");
    });

    it("rejects a token signed with a different secret", async () => {
      const token = await signKioskToken({
        kioskId: "main",
        now: new Date("2026-05-15T12:00:00Z"),
        secret: SECRET,
      });
      const result = await verifyKioskToken({
        token,
        now: new Date("2026-05-15T12:00:00Z"),
        secret: "different-secret",
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid_signature");
    });

    it("rejects a tampered payload", async () => {
      const token = await signKioskToken({
        kioskId: "main",
        now: new Date("2026-05-15T12:00:00Z"),
        secret: SECRET,
      });
      const parts = token.split(".");
      // Change kioskId from "main" to "evil"
      const tampered = `evil.${parts[1]}.${parts[2]}`;
      const result = await verifyKioskToken({
        token: tampered,
        now: new Date("2026-05-15T12:00:00Z"),
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid_signature");
    });

    it("rejects an expired token (>maxAge seconds old)", async () => {
      const signedAt = new Date("2026-05-15T00:00:00Z");
      const checkedAt = new Date("2026-05-16T01:00:00Z"); // 25h later
      const token = await signKioskToken({
        kioskId: "main",
        now: signedAt,
        secret: SECRET,
      });
      const result = await verifyKioskToken({
        token,
        now: checkedAt,
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("token_expired");
    });

    it("rejects a future-dated token (iat clock skew > 60s)", async () => {
      const signedAt = new Date("2026-05-15T12:05:00Z");
      const checkedAt = new Date("2026-05-15T12:00:00Z"); // 5 min before sign
      const token = await signKioskToken({
        kioskId: "main",
        now: signedAt,
        secret: SECRET,
      });
      const result = await verifyKioskToken({
        token,
        now: checkedAt,
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("token_future");
    });

    it("rejects malformed token (wrong number of segments)", async () => {
      const result = await verifyKioskToken({
        token: "not-a-real-token",
        now: new Date(),
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("malformed");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/lib/qr-token.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/qr/token.ts`:

  ```ts
  /**
   * Kiosk QR token. Format: `kioskId.iat.sigBase64Url` (three dot-separated
   * segments, all URL-safe). Signed with HMAC-SHA256 using QR_SECRET.
   *
   * Verification rules:
   *  - Signature must match the (kioskId, iat) pair under the same secret.
   *  - iat must be within [now - maxAgeSeconds, now + 60s] (60s clock-skew grace).
   *
   * Stateless: rotating QR_SECRET in production invalidates all outstanding
   * tokens. No DB row.
   */

  function toBase64Url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function importHmacKey(secret: string): Promise<CryptoKey> {
    return globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }

  async function hmac(secret: string, message: string): Promise<Uint8Array> {
    const key = await importHmacKey(secret);
    const sig = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message),
    );
    return new Uint8Array(sig);
  }

  function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  export async function signKioskToken(input: {
    kioskId: string;
    now: Date;
    secret: string;
  }): Promise<string> {
    const iat = Math.floor(input.now.getTime() / 1000);
    const payload = `${input.kioskId}.${iat}`;
    const sig = await hmac(input.secret, payload);
    return `${payload}.${toBase64Url(sig)}`;
  }

  export type KioskTokenVerifyResult =
    | { ok: true; kioskId: string; iat: number }
    | {
        ok: false;
        reason:
          | "malformed"
          | "invalid_signature"
          | "token_expired"
          | "token_future";
      };

  export async function verifyKioskToken(input: {
    token: string;
    now: Date;
    secret: string;
    maxAgeSeconds: number;
  }): Promise<KioskTokenVerifyResult> {
    const parts = input.token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed" };
    const [kioskId, iatStr, sigB64] = parts;
    const iat = Number(iatStr);
    if (!kioskId || !Number.isFinite(iat) || !sigB64) {
      return { ok: false, reason: "malformed" };
    }

    const expectedSig = await hmac(input.secret, `${kioskId}.${iat}`);
    let providedSig: Uint8Array;
    try {
      providedSig = fromBase64Url(sigB64);
    } catch {
      return { ok: false, reason: "malformed" };
    }
    if (!constantTimeEqual(expectedSig, providedSig)) {
      return { ok: false, reason: "invalid_signature" };
    }

    const nowSec = Math.floor(input.now.getTime() / 1000);
    if (iat > nowSec + 60) return { ok: false, reason: "token_future" };
    if (iat < nowSec - input.maxAgeSeconds) {
      return { ok: false, reason: "token_expired" };
    }
    return { ok: true, kioskId, iat };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/qr-token.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/qr/ tests/lib/qr-token.test.ts
  git commit -m "feat: HMAC-signed kiosk QR token (Web Crypto, CF Workers compatible)"
  ```

---

## Task 1: Schema — `profiles.gym_id` + extend `checkin_source` enum

**Why:** Members type a memorable 4-digit Gym ID at the kiosk. The kiosk submission inserts an attendance row tagged with the new `kiosk_id` source so we can tell kiosk entries apart from future QR-scan or admin-manual entries.

**Files:**
- Modify: `src/db/schema.ts`
- Generated: `drizzle/0003_*.sql` (drizzle-kit output)

- [ ] **Step 1: Add the column + extend the enum in `src/db/schema.ts`**

  Open `src/db/schema.ts`. Find the `checkinSourceEnum` definition near the top and **extend it**:

  ```ts
  export const checkinSourceEnum = pgEnum("checkin_source", [
    "qr_scan",
    "manual",
    "kiosk_id",
  ]);
  ```

  Then find the `profiles = pgTable("profiles", { ... })` definition. **Add the `gymId` column** right after `photoUrl`:

  ```ts
  // Inside profiles = pgTable("profiles", { ... }) — full updated block:
  export const profiles = pgTable(
    "profiles",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      clerkUserId: text("clerk_user_id").notNull().unique(),
      role: roleEnum("role").notNull().default("member"),
      status: profileStatusEnum("status").notNull().default("pending"),
      fullName: text("full_name").notNull(),
      email: text("email").notNull(),
      phone: text("phone"),
      photoUrl: text("photo_url"),
      gymId: integer("gym_id").unique(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => [index("profiles_email_idx").on(t.email)],
  );
  ```

  The `.unique()` builds a unique index on `gym_id` (nulls allowed multiple times in Postgres). No need for a partial index.

- [ ] **Step 2: Generate the migration**

  ```powershell
  npm run db:generate
  ```

  Expected: a new file `drizzle/0003_<random>.sql` containing:
  - `ALTER TYPE "public"."checkin_source" ADD VALUE 'kiosk_id';`
  - `ALTER TABLE "profiles" ADD COLUMN "gym_id" integer;`
  - `ALTER TABLE "profiles" ADD CONSTRAINT "profiles_gym_id_unique" UNIQUE("gym_id");`

  Note: Postgres requires `ALTER TYPE ... ADD VALUE` to be outside a transaction. drizzle-kit emits it as its own statement; the `db:apply` script splits on `--> statement-breakpoint` and runs each separately, so this should just work.

- [ ] **Step 3: Apply the migration to Supabase**

  ```powershell
  npm run db:push
  ```

  Expected: `[✓] Changes applied`. If `db:push` fails because of the enum-in-transaction rule, fall back to `npm run db:apply` (the script in `scripts/apply-migration.ts` already runs statements one-at-a-time).

- [ ] **Step 4: Run schema regression test**

  ```powershell
  npm test -- tests/db/schema.test.ts
  ```

  Expected: pass (existing test only checks queryability).

- [ ] **Step 5: Run the full suite**

  ```powershell
  npm test
  ```

  Expected: all green (Phase 1 + Phase 2 tests unaffected).

- [ ] **Step 6: Commit**

  ```powershell
  git add src/db/schema.ts drizzle/
  git commit -m "feat: add profiles.gym_id and extend checkin_source enum with kiosk_id"
  ```

---

## Task 2: `assignNextGymId` — sequential 1000–9999 assignment

**Why:** When an admin approves a pending member, the same transaction must assign the next free Gym ID. Concurrency: if two admins approve simultaneously the unique constraint will reject the second commit, the test verifies the helper picks the new MAX correctly.

**Files:**
- Create: `src/lib/gym-id.ts`
- Create: `tests/lib/gym-id.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/gym-id.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

  const CLERK_PREFIX = "user_phase3_gymid_";

  async function clean() {
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(clean);
  afterEach(clean);

  async function insertMember(suffix: string, gymId: number | null) {
    const [row] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}${suffix}`,
        email: `${suffix}@x.lk`,
        fullName: `GymId Test ${suffix}`,
        role: "member",
        status: "active",
        gymId,
      })
      .returning();
    return row;
  }

  describe("_assignNextGymIdUnsafe", () => {
    it("returns 1000 when no profiles have a gym_id yet", async () => {
      const next = await _assignNextGymIdUnsafe(db);
      expect(next).toBe(1000);
    });

    it("returns MAX(gym_id) + 1 when some profiles have one", async () => {
      await insertMember("a", 1000);
      await insertMember("b", 1005);
      const next = await _assignNextGymIdUnsafe(db);
      expect(next).toBe(1006);
    });

    it("ignores profiles with null gym_id", async () => {
      await insertMember("pending1", null);
      await insertMember("pending2", null);
      const next = await _assignNextGymIdUnsafe(db);
      expect(next).toBe(1000);
    });

    it("throws if MAX(gym_id) reaches 9999", async () => {
      await insertMember("max", 9999);
      await expect(_assignNextGymIdUnsafe(db)).rejects.toThrow(/exhausted/i);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/gym-id.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/gym-id.ts`:

  ```ts
  import { db as defaultDb } from "@/db";
  import { profiles } from "@/db/schema";
  import { sql } from "drizzle-orm";

  /**
   * Picks the next free Gym ID in [1000, 9999]. Returns 1000 if no profile
   * has a Gym ID yet. Throws if the range is exhausted.
   *
   * Pass a transaction (`tx`) when calling from inside `db.transaction(...)`,
   * otherwise pass the default `db` import.
   */
  type DbLike = typeof defaultDb;

  export async function _assignNextGymIdUnsafe(dbOrTx: DbLike): Promise<number> {
    const rows = await dbOrTx
      .select({ maxId: sql<number | null>`max(${profiles.gymId})` })
      .from(profiles);
    const current = rows[0]?.maxId ?? null;
    const next = current === null ? 1000 : current + 1;
    if (next > 9999) {
      throw new Error("Gym ID range exhausted (1000-9999 all assigned)");
    }
    return next;
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/gym-id.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/gym-id.ts tests/lib/gym-id.test.ts
  git commit -m "feat: assignNextGymId helper (sequential 1000-9999, unique constraint enforced)"
  ```

---

## Task 3a: Pure logic — `evaluateCheckin` (eligibility rules)

**Why:** All five reject reasons (`not_found`, `pending_approval`, `inactive`, `no_active_membership`, `already_checked_in_today`) can be decided from data the caller already has in hand: the profile row, the list of memberships, the today-attendance rows, and `todaySL`. Keeping this pure lets us test every reject path without a DB and lets both the kiosk action AND the future mobile-app endpoint share the rules.

**Files:**
- Create: `src/lib/checkin/evaluate.ts`
- Create: `tests/lib/checkin-evaluate.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/checkin-evaluate.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { evaluateCheckin } from "@/lib/checkin/evaluate";

  const baseMember = {
    id: "M1",
    fullName: "Test Member",
    status: "active" as const,
    photoUrl: null as string | null,
    gymId: 1000 as number | null,
  };
  const activeMembership = {
    id: "MS1",
    status: "active" as const,
    startDate: "2026-05-01",
    endDate: "2026-06-01",
    planName: "Monthly",
  };

  describe("evaluateCheckin", () => {
    it("returns ok with member info when everything is valid", () => {
      const r = evaluateCheckin({
        member: baseMember,
        memberships: [activeMembership],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.member.fullName).toBe("Test Member");
        expect(r.member.planName).toBe("Monthly");
        expect(r.member.expiresOn).toBe("2026-06-01");
        expect(r.member.daysRemaining).toBe(17);
      }
    });

    it("rejects when member is null (not found)", () => {
      const r = evaluateCheckin({
        member: null,
        memberships: [],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_found");
    });

    it("rejects pending_approval before checking memberships", () => {
      const r = evaluateCheckin({
        member: { ...baseMember, status: "pending" },
        memberships: [activeMembership],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("pending_approval");
    });

    it("rejects inactive members", () => {
      const r = evaluateCheckin({
        member: { ...baseMember, status: "inactive" },
        memberships: [activeMembership],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("inactive");
    });

    it("rejects when no membership is currently active", () => {
      const r = evaluateCheckin({
        member: baseMember,
        memberships: [
          { ...activeMembership, status: "expired", endDate: "2026-04-01" },
        ],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no_active_membership");
    });

    it("rejects when membership end_date is past today", () => {
      const r = evaluateCheckin({
        member: baseMember,
        memberships: [
          { ...activeMembership, status: "active", endDate: "2026-05-14" },
        ],
        todaySL: "2026-05-15",
        todayAttendance: [],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no_active_membership");
    });

    it("rejects same-day duplicate check-in", () => {
      const r = evaluateCheckin({
        member: baseMember,
        memberships: [activeMembership],
        todayAttendance: [{ id: "A1", checkedInAt: "2026-05-15T03:00:00Z" }],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("already_checked_in_today");
    });

    it("daysRemaining is 0 on the final day (end_date == today)", () => {
      const r = evaluateCheckin({
        member: baseMember,
        memberships: [{ ...activeMembership, endDate: "2026-05-15" }],
        todayAttendance: [],
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.member.daysRemaining).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/checkin-evaluate.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/checkin/evaluate.ts`:

  ```ts
  import { daysRemaining } from "@/lib/days-remaining";
  import { getCurrentMembership } from "@/lib/memberships/current";

  export type EvaluateMember = {
    id: string;
    fullName: string;
    status: "pending" | "active" | "inactive";
    photoUrl: string | null;
    gymId: number | null;
  };

  export type EvaluateMembership = {
    id: string;
    status: "active" | "expired" | "cancelled";
    startDate: string;
    endDate: string;
    planName: string;
  };

  export type EvaluateAttendance = {
    id: string;
    checkedInAt: string | Date;
  };

  export type CheckinRejectReason =
    | "not_found"
    | "pending_approval"
    | "inactive"
    | "no_active_membership"
    | "already_checked_in_today";

  export type CheckinResult =
    | {
        ok: true;
        member: {
          memberId: string;
          fullName: string;
          photoUrl: string | null;
          gymId: number | null;
          planName: string;
          expiresOn: string;
          daysRemaining: number;
          membershipId: string;
        };
      }
    | { ok: false; reason: CheckinRejectReason };

  export function evaluateCheckin(input: {
    member: EvaluateMember | null;
    memberships: EvaluateMembership[];
    todayAttendance: EvaluateAttendance[];
    todaySL: string; // YYYY-MM-DD
  }): CheckinResult {
    const { member, memberships, todayAttendance, todaySL } = input;

    if (!member) return { ok: false, reason: "not_found" };
    if (member.status === "pending") {
      return { ok: false, reason: "pending_approval" };
    }
    if (member.status === "inactive") return { ok: false, reason: "inactive" };

    const current = getCurrentMembership(memberships, todaySL);
    if (!current) return { ok: false, reason: "no_active_membership" };

    if (todayAttendance.length > 0) {
      return { ok: false, reason: "already_checked_in_today" };
    }

    return {
      ok: true,
      member: {
        memberId: member.id,
        fullName: member.fullName,
        photoUrl: member.photoUrl,
        gymId: member.gymId,
        planName: current.planName,
        expiresOn: current.endDate,
        daysRemaining: daysRemaining({ today: todaySL, endDate: current.endDate }),
        membershipId: current.id,
      },
    };
  }
  ```

  Note: `getCurrentMembership` from `src/lib/memberships/current.ts` already has the right rule (`status='active' AND end_date >= today`). The new `EvaluateMembership` type extends its `MembershipForCurrentCheck` requirements (adds `planName`), so the generic infers correctly.

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/checkin-evaluate.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/checkin/evaluate.ts tests/lib/checkin-evaluate.test.ts
  git commit -m "feat: pure-logic check-in eligibility evaluator (5 reject reasons)"
  ```

---

## Task 3b: `_recordAttendanceByGymIdUnsafe` — DB query + eligibility + insert

**Why:** Wraps `evaluateCheckin` against a real database lookup-by-Gym-ID and inserts the attendance row. Used by both the kiosk server action (Task 5) and — once the mobile app exists — the QR-scan endpoint (Task 6) by way of a sibling `_recordAttendanceByMemberIdUnsafe`.

**Files:**
- Create: `src/lib/checkin/record.ts`
- Create: `tests/lib/checkin-record.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/checkin-record.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, attendance } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import {
    _recordAttendanceByGymIdUnsafe,
    _recordAttendanceByMemberIdUnsafe,
  } from "@/lib/checkin/record";

  const CLERK_PREFIX = "user_phase3_record_";
  const PLAN_NAME = "Phase3RecordPlan";

  let memberId: string;
  let planId: string;

  async function clean() {
    const members = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of members) {
      await db.delete(attendance).where(eq(attendance.memberId, m.id));
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "rec@x.lk",
        fullName: "Record Member",
        role: "member",
        status: "active",
        gymId: 1100,
      })
      .returning();
    memberId = m.id;
    await db.insert(memberships).values({
      memberId,
      planId,
      startDate: "2026-05-01",
      endDate: "2026-06-30",
      status: "active",
    });
  });

  afterEach(clean);

  describe("_recordAttendanceByGymIdUnsafe", () => {
    it("inserts attendance row with source='kiosk_id' on happy path", async () => {
      const r = await _recordAttendanceByGymIdUnsafe({
        gymId: 1100,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.member.fullName).toBe("Record Member");
      const rows = await db
        .select()
        .from(attendance)
        .where(eq(attendance.memberId, memberId));
      expect(rows.length).toBe(1);
      expect(rows[0].source).toBe("kiosk_id");
    });

    it("rejects unknown gym_id with not_found", async () => {
      const r = await _recordAttendanceByGymIdUnsafe({
        gymId: 9876,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_found");
    });

    it("rejects same-day duplicate", async () => {
      const r1 = await _recordAttendanceByGymIdUnsafe({
        gymId: 1100,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r1.ok).toBe(true);
      const r2 = await _recordAttendanceByGymIdUnsafe({
        gymId: 1100,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.reason).toBe("already_checked_in_today");
      const rows = await db
        .select()
        .from(attendance)
        .where(eq(attendance.memberId, memberId));
      expect(rows.length).toBe(1);
    });

    it("rejects when member is pending", async () => {
      await db
        .update(profiles)
        .set({ status: "pending" })
        .where(eq(profiles.id, memberId));
      const r = await _recordAttendanceByGymIdUnsafe({
        gymId: 1100,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("pending_approval");
    });

    it("rejects when membership is expired", async () => {
      await db
        .update(memberships)
        .set({ status: "expired", endDate: "2026-04-01" })
        .where(eq(memberships.memberId, memberId));
      const r = await _recordAttendanceByGymIdUnsafe({
        gymId: 1100,
        todaySL: "2026-05-15",
        source: "kiosk_id",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no_active_membership");
    });
  });

  describe("_recordAttendanceByMemberIdUnsafe", () => {
    it("inserts attendance row with source='qr_scan' for mobile-app path", async () => {
      const r = await _recordAttendanceByMemberIdUnsafe({
        memberId,
        todaySL: "2026-05-15",
        source: "qr_scan",
      });
      expect(r.ok).toBe(true);
      const rows = await db
        .select()
        .from(attendance)
        .where(eq(attendance.memberId, memberId));
      expect(rows.length).toBe(1);
      expect(rows[0].source).toBe("qr_scan");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/checkin-record.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/checkin/record.ts`:

  ```ts
  import { db } from "@/db";
  import { profiles, memberships, plans, attendance } from "@/db/schema";
  import { eq, and, gte, lte, sql } from "drizzle-orm";
  import { evaluateCheckin, type CheckinResult } from "./evaluate";

  type Source = "kiosk_id" | "qr_scan" | "manual";

  /**
   * SL-local day window expressed as a UTC range:
   *  [todaySL 00:00 +05:30, todaySL+1 00:00 +05:30)
   * = [todaySL 18:30 UTC the previous calendar day, todaySL 18:30 UTC]
   * Postgres handles the timestamptz comparison correctly when we pass
   * the literal `YYYY-MM-DD 00:00:00+05:30` string.
   */
  function slDayWindow(todaySL: string): {
    fromUtc: string;
    toUtc: string;
  } {
    return {
      fromUtc: `${todaySL} 00:00:00+05:30`,
      toUtc: `${todaySL} 24:00:00+05:30`,
    };
  }

  async function loadAndEvaluate(input: {
    memberRow: typeof profiles.$inferSelect | null;
    todaySL: string;
  }): Promise<CheckinResult> {
    if (!input.memberRow) {
      return evaluateCheckin({
        member: null,
        memberships: [],
        todayAttendance: [],
        todaySL: input.todaySL,
      });
    }
    const m = input.memberRow;

    const mems = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, m.id));

    const { fromUtc, toUtc } = slDayWindow(input.todaySL);
    const todays = await db
      .select({ id: attendance.id, checkedInAt: attendance.checkedInAt })
      .from(attendance)
      .where(
        and(
          eq(attendance.memberId, m.id),
          gte(attendance.checkedInAt, sql`${fromUtc}::timestamptz`),
          lte(attendance.checkedInAt, sql`${toUtc}::timestamptz`),
        ),
      );

    return evaluateCheckin({
      member: {
        id: m.id,
        fullName: m.fullName,
        status: m.status,
        photoUrl: m.photoUrl,
        gymId: m.gymId,
      },
      memberships: mems,
      todayAttendance: todays.map((t) => ({
        id: t.id,
        checkedInAt: t.checkedInAt,
      })),
      todaySL: input.todaySL,
    });
  }

  async function insertAttendance(input: {
    memberId: string;
    membershipId: string;
    source: Source;
  }): Promise<void> {
    await db.insert(attendance).values({
      memberId: input.memberId,
      membershipId: input.membershipId,
      source: input.source,
    });
  }

  export async function _recordAttendanceByGymIdUnsafe(input: {
    gymId: number;
    todaySL: string;
    source: Source;
  }): Promise<CheckinResult> {
    const [memberRow] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.gymId, input.gymId))
      .limit(1);
    const evalResult = await loadAndEvaluate({
      memberRow: memberRow ?? null,
      todaySL: input.todaySL,
    });
    if (!evalResult.ok) return evalResult;
    await insertAttendance({
      memberId: evalResult.member.memberId,
      membershipId: evalResult.member.membershipId,
      source: input.source,
    });
    return evalResult;
  }

  export async function _recordAttendanceByMemberIdUnsafe(input: {
    memberId: string;
    todaySL: string;
    source: Source;
  }): Promise<CheckinResult> {
    const [memberRow] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.memberId))
      .limit(1);
    const evalResult = await loadAndEvaluate({
      memberRow: memberRow ?? null,
      todaySL: input.todaySL,
    });
    if (!evalResult.ok) return evalResult;
    await insertAttendance({
      memberId: evalResult.member.memberId,
      membershipId: evalResult.member.membershipId,
      source: input.source,
    });
    return evalResult;
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/checkin-record.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/checkin/record.ts tests/lib/checkin-record.test.ts
  git commit -m "feat: _recordAttendance helpers (by gym_id and by member_id) with eligibility checks"
  ```

---

## Task 4: Modify approve flow to assign `gym_id` atomically

**Why:** Approval is the point at which a member transitions from "pending" to "can use the kiosk". The new Gym ID must be assigned inside the same transaction that flips `status='active'` and inserts the membership row, so we never end up with an approved member who can't check in.

**Files:**
- Modify: `src/app/admin/pending/actions.ts`
- Create: `tests/app/admin/pending-actions-with-gym-id.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/admin/pending-actions-with-gym-id.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _approveMemberUnsafe } from "@/app/admin/pending/actions";

  const CLERK_PREFIX = "user_phase3_approve_gymid_";
  const PLAN_NAME = "Phase3ApproveGymIdPlan";

  let planId: string;
  let adminId: string;

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(payments).where(eq(payments.memberId, m.id));
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    planId = pl.id;
    const [a] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}admin`,
        email: "agi-a@x.lk",
        fullName: "Approve GymId Admin",
        role: "admin",
        status: "active",
      })
      .returning();
    adminId = a.id;
  });

  afterEach(clean);

  async function insertPending(suffix: string) {
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}${suffix}`,
        email: `${suffix}@x.lk`,
        fullName: `Pending ${suffix}`,
        role: "member",
        status: "pending",
      })
      .returning();
    return m;
  }

  describe("_approveMemberUnsafe assigns gym_id", () => {
    it("assigns gym_id starting at 1000 on the first approval", async () => {
      const member = await insertPending("first");
      const r = await _approveMemberUnsafe({
        memberId: member.id,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(true);
      const [reloaded] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, member.id));
      expect(reloaded.gymId).toBe(1000);
    });

    it("assigns consecutive gym_ids across multiple approvals", async () => {
      const m1 = await insertPending("seq1");
      const m2 = await insertPending("seq2");
      await _approveMemberUnsafe({
        memberId: m1.id,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      await _approveMemberUnsafe({
        memberId: m2.id,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      const [r1] = await db.select().from(profiles).where(eq(profiles.id, m1.id));
      const [r2] = await db.select().from(profiles).where(eq(profiles.id, m2.id));
      expect(r2.gymId).toBe((r1.gymId ?? 0) + 1);
    });

    it("does not overwrite an existing gym_id on re-approval of an active member", async () => {
      const member = await insertPending("reapprove");
      await _approveMemberUnsafe({
        memberId: member.id,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      const [firstPass] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, member.id));
      const firstGymId = firstPass.gymId;

      // Try to approve again — should be a no-op (already active)
      const r = await _approveMemberUnsafe({
        memberId: member.id,
        planId,
        approvedByProfileId: adminId,
        today: "2026-05-15",
      });
      expect(r.ok).toBe(false);

      const [secondPass] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, member.id));
      expect(secondPass.gymId).toBe(firstGymId);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/admin/pending-actions-with-gym-id.test.ts
  ```

- [ ] **Step 3: Modify `src/app/admin/pending/actions.ts`**

  Replace the entire file with:

  ```ts
  "use server";

  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { clerkClient } from "@clerk/nextjs/server";
  import { requireAdminProfile } from "@/lib/auth";
  import { computeMembershipWindow } from "@/lib/memberships/window";
  import { validatePaymentInput } from "@/lib/payments/validate";
  import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

  export type ApprovePaymentInput = {
    amountLkr: string;
    method: "cash" | "bank_transfer";
    reference: string;
    notes: string;
  };

  export type ApproveInput = {
    memberId: string;
    planId: string;
    approvedByProfileId: string;
    today: string;
    /** Optional: record an initial membership payment in the same transaction. */
    initialMembershipPayment?: ApprovePaymentInput;
    /** Optional: record an admission fee in the same transaction. */
    admissionFee?: ApprovePaymentInput;
  };

  export type ApproveResult = { ok: true } | { ok: false; error: string };

  export async function _approveMemberUnsafe(input: ApproveInput): Promise<ApproveResult> {
    const [member] = await db.select().from(profiles).where(eq(profiles.id, input.memberId)).limit(1);
    if (!member) return { ok: false, error: "Member not found" };
    if (member.status === "active") return { ok: false, error: "Member is already active" };

    const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (!plan) return { ok: false, error: "Plan not found" };
    if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

    if (input.initialMembershipPayment) {
      const v = validatePaymentInput({
        amountLkr: input.initialMembershipPayment.amountLkr,
        method: input.initialMembershipPayment.method,
        kind: "membership",
        reference: input.initialMembershipPayment.reference,
        notes: input.initialMembershipPayment.notes,
      });
      if (!v.ok) return { ok: false, error: "Membership payment is invalid" };
    }
    if (input.admissionFee) {
      const v = validatePaymentInput({
        amountLkr: input.admissionFee.amountLkr,
        method: input.admissionFee.method,
        kind: "admission",
        reference: input.admissionFee.reference,
        notes: input.admissionFee.notes,
      });
      if (!v.ok) return { ok: false, error: "Admission fee is invalid" };
    }

    const window = computeMembershipWindow({
      today: input.today,
      durationDays: plan.durationDays,
    });

    try {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(memberships)
          .values({
            memberId: input.memberId,
            planId: input.planId,
            startDate: window.startDate,
            endDate: window.endDate,
            status: "active",
            createdBy: input.approvedByProfileId,
          })
          .returning({ id: memberships.id });

        // Assign next gym_id only if the profile doesn't already have one
        // (defensive — pending profiles should always be null but a manual
        // INSERT could have set one).
        let gymIdToSet: number | null = null;
        if (member.gymId === null) {
          gymIdToSet = await _assignNextGymIdUnsafe(tx);
        }

        await tx
          .update(profiles)
          .set({
            status: "active",
            ...(gymIdToSet !== null ? { gymId: gymIdToSet } : {}),
          })
          .where(eq(profiles.id, input.memberId));

        if (input.initialMembershipPayment) {
          const v = validatePaymentInput({
            amountLkr: input.initialMembershipPayment.amountLkr,
            method: input.initialMembershipPayment.method,
            kind: "membership",
            reference: input.initialMembershipPayment.reference,
            notes: input.initialMembershipPayment.notes,
          });
          if (v.ok) {
            await tx.insert(payments).values({
              memberId: input.memberId,
              membershipId: created.id,
              amountLkr: v.value.amountLkr,
              method: v.value.method,
              kind: "membership",
              status: "succeeded",
              reference: v.value.reference,
              notes: v.value.notes,
              recordedBy: input.approvedByProfileId,
            });
          }
        }

        if (input.admissionFee) {
          const v = validatePaymentInput({
            amountLkr: input.admissionFee.amountLkr,
            method: input.admissionFee.method,
            kind: "admission",
            reference: input.admissionFee.reference,
            notes: input.admissionFee.notes,
          });
          if (v.ok) {
            await tx.insert(payments).values({
              memberId: input.memberId,
              membershipId: null,
              amountLkr: v.value.amountLkr,
              method: v.value.method,
              kind: "admission",
              status: "succeeded",
              reference: v.value.reference,
              notes: v.value.notes,
              recordedBy: input.approvedByProfileId,
            });
          }
        }
      });
    } catch {
      return { ok: false, error: "Approval transaction failed" };
    }

    return { ok: true };
  }

  export async function approveMember(
    _prev: ApproveResult | undefined,
    formData: FormData,
  ): Promise<ApproveResult> {
    const admin = await requireAdminProfile();
    const memberId = String(formData.get("memberId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    if (!memberId || !planId) return { ok: false, error: "memberId and planId required" };

    const includeAdmission = formData.get("includeAdmission") === "on";
    const includeFirstPayment = formData.get("includeFirstPayment") === "on";

    const today = (await import("@/lib/tz")).todayInSL();
    const result = await _approveMemberUnsafe({
      memberId,
      planId,
      approvedByProfileId: admin.id,
      today,
      admissionFee: includeAdmission
        ? {
            amountLkr: String(formData.get("admissionAmount") ?? ""),
            method: String(formData.get("admissionMethod") ?? "cash") as
              | "cash"
              | "bank_transfer",
            reference: "",
            notes: "",
          }
        : undefined,
      initialMembershipPayment: includeFirstPayment
        ? {
            amountLkr: String(formData.get("paymentAmount") ?? ""),
            method: String(formData.get("paymentMethod") ?? "cash") as
              | "cash"
              | "bank_transfer",
            reference: "",
            notes: "",
          }
        : undefined,
    });

    if (result.ok) {
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
      revalidatePath("/admin/reports");
    }

    return result;
  }
  ```

- [ ] **Step 4: Run the new test — expect pass**

  ```powershell
  npm test -- tests/app/admin/pending-actions-with-gym-id.test.ts
  ```

- [ ] **Step 5: Run the existing approve test to confirm no regression**

  ```powershell
  npm test -- tests/app/admin/pending-actions.test.ts tests/app/admin/pending-actions-with-payment.test.ts
  ```

  Expected: all green.

- [ ] **Step 6: Run the full suite**

  ```powershell
  npm test
  ```

  Expected: all green.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/admin/pending/actions.ts tests/app/admin/pending-actions-with-gym-id.test.ts
  git commit -m "feat: assign gym_id atomically inside approve-member transaction"
  ```

---

## Task 5: Kiosk page + `submitGymId` server action

**Why:** This is the user-facing surface. A member walks up to the laptop, types 4 digits, hits Submit, and sees a green confirmation card with their name + plan + days remaining. The page is public (no auth) and lives at `/checkin`.

### 5a — install `qrcode`

- [ ] **Step 1: Install the package**

  ```powershell
  npm install qrcode
  npm install --save-dev @types/qrcode
  ```

  Expected: `package.json` gains both deps; `package-lock.json` updates.

### 5b — server actions + page

**Files:**
- Create: `src/app/checkin/actions.ts`, `src/app/checkin/page.tsx`, `src/app/checkin/_form.tsx`, `src/app/checkin/_kiosk-qr.tsx`
- Create: `tests/app/checkin/submit-gym-id.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/app/checkin/submit-gym-id.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, attendance } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _submitGymIdUnsafe } from "@/app/checkin/actions";

  const CLERK_PREFIX = "user_phase3_submit_";
  const PLAN_NAME = "Phase3SubmitPlan";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(attendance).where(eq(attendance.memberId, m.id));
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "sub@x.lk",
        fullName: "Submit Member",
        role: "member",
        status: "active",
        gymId: 1200,
      })
      .returning();
    memberId = m.id;
    await db.insert(memberships).values({
      memberId,
      planId,
      startDate: "2026-05-01",
      endDate: "2026-06-30",
      status: "active",
    });
  });

  afterEach(clean);

  describe("_submitGymIdUnsafe", () => {
    it("happy path returns member details and inserts attendance", async () => {
      const r = await _submitGymIdUnsafe({
        gymIdRaw: "1200",
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.member.fullName).toBe("Submit Member");
        expect(r.member.gymId).toBe(1200);
        expect(r.member.daysRemaining).toBeGreaterThan(0);
      }
    });

    it("rejects non-numeric input as invalid_format", async () => {
      const r = await _submitGymIdUnsafe({
        gymIdRaw: "abcd",
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_format");
    });

    it("rejects out-of-range Gym ID as invalid_format", async () => {
      const r = await _submitGymIdUnsafe({
        gymIdRaw: "999",
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_format");
    });

    it("trims whitespace", async () => {
      const r = await _submitGymIdUnsafe({
        gymIdRaw: "  1200  ",
        todaySL: "2026-05-15",
      });
      expect(r.ok).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/checkin/submit-gym-id.test.ts
  ```

- [ ] **Step 3: Implement the server actions**

  Create `src/app/checkin/actions.ts`:

  ```ts
  "use server";

  import { revalidatePath } from "next/cache";
  import { todayInSL } from "@/lib/tz";
  import {
    _recordAttendanceByGymIdUnsafe,
  } from "@/lib/checkin/record";
  import { signKioskToken } from "@/lib/qr/token";

  export type SubmitGymIdResult =
    | {
        ok: true;
        member: {
          memberId: string;
          fullName: string;
          photoUrl: string | null;
          gymId: number | null;
          planName: string;
          expiresOn: string;
          daysRemaining: number;
        };
      }
    | {
        ok: false;
        reason:
          | "invalid_format"
          | "not_found"
          | "pending_approval"
          | "inactive"
          | "no_active_membership"
          | "already_checked_in_today"
          | "db_error";
      };

  /** Test-only entry point. No revalidatePath. */
  export async function _submitGymIdUnsafe(input: {
    gymIdRaw: string;
    todaySL: string;
  }): Promise<SubmitGymIdResult> {
    const trimmed = input.gymIdRaw.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, reason: "invalid_format" };
    }
    const n = Number(trimmed);
    if (n < 1000 || n > 9999) {
      return { ok: false, reason: "invalid_format" };
    }
    try {
      const r = await _recordAttendanceByGymIdUnsafe({
        gymId: n,
        todaySL: input.todaySL,
        source: "kiosk_id",
      });
      if (!r.ok) return { ok: false, reason: r.reason };
      return {
        ok: true,
        member: {
          memberId: r.member.memberId,
          fullName: r.member.fullName,
          photoUrl: r.member.photoUrl,
          gymId: r.member.gymId,
          planName: r.member.planName,
          expiresOn: r.member.expiresOn,
          daysRemaining: r.member.daysRemaining,
        },
      };
    } catch (e) {
      console.error("submitGymId db error", e);
      return { ok: false, reason: "db_error" };
    }
  }

  /** Form-action wrapper called from the kiosk client component. */
  export async function submitGymId(
    _prev: SubmitGymIdResult | undefined,
    formData: FormData,
  ): Promise<SubmitGymIdResult> {
    const gymIdRaw = String(formData.get("gymId") ?? "");
    const result = await _submitGymIdUnsafe({
      gymIdRaw,
      todaySL: todayInSL(),
    });
    if (result.ok) {
      revalidatePath(`/admin/members/${result.member.memberId}`);
      revalidatePath("/portal");
    }
    return result;
  }

  /** Returns a fresh signed kiosk token for the QR. Public — no auth gate. */
  export async function getFreshKioskToken(): Promise<string> {
    const secret = process.env.QR_SECRET;
    if (!secret) throw new Error("QR_SECRET is not set");
    return signKioskToken({
      kioskId: "main",
      now: new Date(),
      secret,
    });
  }
  ```

- [ ] **Step 4: Run the new test — expect pass**

  ```powershell
  npm test -- tests/app/checkin/submit-gym-id.test.ts
  ```

- [ ] **Step 5: Implement the kiosk page**

  Create `src/app/checkin/page.tsx`:

  ```tsx
  import { getFreshKioskToken } from "./actions";
  import { CheckinForm } from "./_form";
  import { KioskQR } from "./_kiosk-qr";

  export const dynamic = "force-dynamic";

  export default async function CheckinKioskPage() {
    const initialToken = await getFreshKioskToken();

    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          <h1 className="text-center text-2xl font-semibold">Scan the QR</h1>
          <div className="flex justify-center">
            <KioskQR initialToken={initialToken} />
          </div>
          <div className="text-center text-muted-foreground text-sm">OR</div>
          <CheckinForm />
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 6: Implement the QR client component**

  Create `src/app/checkin/_kiosk-qr.tsx`:

  ```tsx
  "use client";

  import { useEffect, useRef, useState } from "react";
  import QRCode from "qrcode";
  import { getFreshKioskToken } from "./actions";

  const REFRESH_MS = 5 * 60 * 1000;

  export function KioskQR({ initialToken }: { initialToken: string }) {
    const [token, setToken] = useState(initialToken);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      if (!canvasRef.current) return;
      QRCode.toCanvas(canvasRef.current, token, {
        width: 240,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch((e) => console.error("QR render failed", e));
    }, [token]);

    useEffect(() => {
      const id = setInterval(async () => {
        try {
          const fresh = await getFreshKioskToken();
          setToken(fresh);
        } catch (e) {
          console.error("QR refresh failed", e);
        }
      }, REFRESH_MS);
      return () => clearInterval(id);
    }, []);

    return <canvas ref={canvasRef} aria-label="Kiosk check-in QR" />;
  }
  ```

- [ ] **Step 7: Implement the form client component**

  Create `src/app/checkin/_form.tsx`:

  ```tsx
  "use client";

  import { useActionState, useEffect, useRef } from "react";
  import { submitGymId, type SubmitGymIdResult } from "./actions";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";

  const RESULT_DISPLAY_MS = 5000;

  function rejectMessage(
    reason: Exclude<SubmitGymIdResult, { ok: true }>["reason"],
  ): string {
    switch (reason) {
      case "invalid_format":
        return "Please enter a 4-digit Gym ID.";
      case "not_found":
        return "No member found with that Gym ID.";
      case "pending_approval":
        return "Your account is awaiting approval. Please see the front desk.";
      case "inactive":
        return "Your account is inactive. Please see the front desk to reactivate.";
      case "no_active_membership":
        return "Your membership has expired. Please renew at the front desk.";
      case "already_checked_in_today":
        return "Already checked in today. Welcome back!";
      case "db_error":
        return "Couldn't record check-in. Please try again. (E-DB)";
    }
  }

  export function CheckinForm() {
    const [state, dispatch, pending] = useActionState<
      SubmitGymIdResult | undefined,
      FormData
    >(submitGymId, undefined);
    const formRef = useRef<HTMLFormElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (!state) return;
      const t = setTimeout(() => {
        formRef.current?.reset();
        inputRef.current?.focus();
        // Force the action state back to undefined by remounting via key isn't
        // necessary — the next dispatch will overwrite it. We leave the card
        // visible until next interaction or next render cycle.
      }, RESULT_DISPLAY_MS);
      return () => clearTimeout(t);
    }, [state]);

    return (
      <div className="space-y-4">
        <form action={dispatch} ref={formRef} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gymId" className="text-base">
              Enter Your Gym ID:
            </Label>
            <Input
              id="gymId"
              name="gymId"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="eg : 1234"
              ref={inputRef}
              className="h-14 text-lg"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full h-12 text-base"
          >
            {pending ? "Checking…" : "Submit"}
          </Button>
        </form>

        {state?.ok && (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-center space-y-1">
            <div className="text-green-700 dark:text-green-300 text-lg font-semibold">
              ✓ Welcome, {state.member.fullName}
            </div>
            <div className="text-sm text-muted-foreground">
              {state.member.planName} — {state.member.daysRemaining} day
              {state.member.daysRemaining === 1 ? "" : "s"} remaining
            </div>
          </div>
        )}

        {state && !state.ok && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center">
            <div className="text-destructive font-medium">
              {rejectMessage(state.reason)}
            </div>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 8: Manual smoke test**

  ```powershell
  npm run dev
  ```

  Open `http://localhost:3000/checkin` in a private window (no Clerk session needed).

  Expected: page renders, QR canvas is visible, Gym ID input is autofocused. Type a real Gym ID from a seeded member → green card. Type a bad one → red card.

  Stop the dev server before continuing.

- [ ] **Step 9: Commit**

  ```powershell
  git add package.json package-lock.json src/app/checkin/ tests/app/checkin/submit-gym-id.test.ts
  git commit -m "feat: public /checkin kiosk page with Gym ID form + rotating HMAC QR"
  ```

---

## Task 6: `/api/checkin/scan` — mobile-app stub endpoint

**Why:** The future mobile app will let signed-in members scan the kiosk QR with their phone. The endpoint validates the kiosk HMAC token, accepts a `memberId` from the request body, runs the same eligibility rules, and inserts attendance with `source='qr_scan'`. In Phase 3 we ship the contract and the server-side logic; the client comes in a later project.

**Files:**
- Create: `src/app/api/checkin/scan/route.ts`
- Create: `tests/app/checkin/scan-route.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/app/checkin/scan-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, attendance } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { POST } from "@/app/api/checkin/scan/route";
  import { signKioskToken } from "@/lib/qr/token";

  const CLERK_PREFIX = "user_phase3_scan_";
  const PLAN_NAME = "Phase3ScanPlan";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(attendance).where(eq(attendance.memberId, m.id));
      await db.delete(memberships).where(eq(memberships.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;

  beforeEach(async () => {
    await clean();
    process.env.QR_SECRET = "test-secret-for-scan-route";
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "scan@x.lk",
        fullName: "Scan Member",
        role: "member",
        status: "active",
        gymId: 1300,
      })
      .returning();
    memberId = m.id;
    await db.insert(memberships).values({
      memberId,
      planId: pl.id,
      startDate: "2026-05-01",
      endDate: "2026-06-30",
      status: "active",
    });
  });

  afterEach(clean);

  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/checkin/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("POST /api/checkin/scan", () => {
    it("inserts attendance and returns member info on happy path", async () => {
      const token = await signKioskToken({
        kioskId: "main",
        now: new Date(),
        secret: process.env.QR_SECRET!,
      });
      const res = await POST(makeRequest({ token, memberId }));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
      const rows = await db
        .select()
        .from(attendance)
        .where(eq(attendance.memberId, memberId));
      expect(rows.length).toBe(1);
      expect(rows[0].source).toBe("qr_scan");
    });

    it("returns 401 on tampered token", async () => {
      const token = await signKioskToken({
        kioskId: "main",
        now: new Date(),
        secret: process.env.QR_SECRET!,
      });
      const parts = token.split(".");
      const tampered = `evil.${parts[1]}.${parts[2]}`;
      const res = await POST(makeRequest({ token: tampered, memberId }));
      expect(res.status).toBe(401);
    });

    it("returns 401 on expired token (>24h old)", async () => {
      const oldToken = await signKioskToken({
        kioskId: "main",
        now: new Date(Date.now() - 25 * 60 * 60 * 1000),
        secret: process.env.QR_SECRET!,
      });
      const res = await POST(makeRequest({ token: oldToken, memberId }));
      expect(res.status).toBe(401);
    });

    it("returns 400 on missing fields", async () => {
      const res = await POST(makeRequest({ memberId }));
      expect(res.status).toBe(400);
    });

    it("returns 200 with ok=false for eligibility rejections (e.g., not_found)", async () => {
      const token = await signKioskToken({
        kioskId: "main",
        now: new Date(),
        secret: process.env.QR_SECRET!,
      });
      const res = await POST(
        makeRequest({
          token,
          memberId: "00000000-0000-0000-0000-000000000000",
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; reason?: string };
      expect(json.ok).toBe(false);
      expect(json.reason).toBe("not_found");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/checkin/scan-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/checkin/scan/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { verifyKioskToken } from "@/lib/qr/token";
  import { _recordAttendanceByMemberIdUnsafe } from "@/lib/checkin/record";
  import { todayInSL } from "@/lib/tz";

  const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60;

  export async function POST(req: Request) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { token, memberId } = (body ?? {}) as {
      token?: unknown;
      memberId?: unknown;
    };
    if (typeof token !== "string" || typeof memberId !== "string") {
      return NextResponse.json(
        { error: "token and memberId required" },
        { status: 400 },
      );
    }
    const secret = process.env.QR_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 },
      );
    }
    const verify = await verifyKioskToken({
      token,
      now: new Date(),
      secret,
      maxAgeSeconds: MAX_TOKEN_AGE_SECONDS,
    });
    if (!verify.ok) {
      return NextResponse.json(
        { error: "Invalid token", reason: verify.reason },
        { status: 401 },
      );
    }

    const result = await _recordAttendanceByMemberIdUnsafe({
      memberId,
      todaySL: todayInSL(),
      source: "qr_scan",
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason });
    }
    return NextResponse.json({
      ok: true,
      member: {
        fullName: result.member.fullName,
        planName: result.member.planName,
        expiresOn: result.member.expiresOn,
        daysRemaining: result.member.daysRemaining,
      },
    });
  }
  ```

- [ ] **Step 4: Run the test — expect pass**

  ```powershell
  npm test -- tests/app/checkin/scan-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/checkin/ tests/app/checkin/scan-route.test.ts
  git commit -m "feat: /api/checkin/scan stub endpoint for future mobile app"
  ```

---

## Task 7: Admin member detail — Gym ID + Attendance section

**Why:** Admins need to see the member's Gym ID (to read it out if a member forgets) and their attendance history.

**Files:**
- Modify: `src/app/admin/members/[id]/page.tsx`
- Create: `src/app/admin/members/[id]/_attendance-table.tsx`

- [ ] **Step 1: Create the attendance table component**

  Create `src/app/admin/members/[id]/_attendance-table.tsx`:

  ```tsx
  import { format } from "date-fns";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import { Badge } from "@/components/ui/badge";

  export type AttendanceRow = {
    id: string;
    checkedInAt: Date;
    source: "qr_scan" | "manual" | "kiosk_id";
  };

  function sourceLabel(s: AttendanceRow["source"]) {
    switch (s) {
      case "kiosk_id":
        return "Kiosk";
      case "qr_scan":
        return "QR scan";
      case "manual":
        return "Manual";
    }
  }

  export function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Checked in at</TableHead>
            <TableHead className="w-32">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                No check-ins yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{format(r.checkedInAt, "PPp")}</TableCell>
              <TableCell>
                <Badge variant="outline">{sourceLabel(r.source)}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  ```

- [ ] **Step 2: Modify the page**

  Replace `src/app/admin/members/[id]/page.tsx`:

  ```tsx
  import { notFound } from "next/navigation";
  import { db } from "@/db";
  import { profiles, memberships, plans, payments, attendance } from "@/db/schema";
  import { eq, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import { getCurrentMembership } from "@/lib/memberships/current";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import { format } from "date-fns";
  import { todayInSL } from "@/lib/tz";
  import { computeOutstanding } from "@/lib/payments/outstanding";
  import { PaymentsTable } from "./_payments-table";
  import { RecordPaymentButton } from "./_record-payment-button";
  import { AttendanceTable } from "./_attendance-table";

  export default async function MemberDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    await requireAdminProfile();
    const { id } = await params;

    const [member] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    if (!member) notFound();

    const history = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
        planPriceLkr: plans.priceLkr,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, id))
      .orderBy(desc(memberships.endDate));

    const today = todayInSL();
    const current = getCurrentMembership(history, today);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, id))
      .orderBy(desc(payments.paidAt));

    const refundedReferences = new Set(
      paymentRows
        .filter((p) => p.status === "refunded" && p.reference)
        .map((p) => p.reference!),
    );

    const attendanceRows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, id))
      .orderBy(desc(attendance.checkedInAt))
      .limit(30);

    const outstanding = current
      ? computeOutstanding({
          planPriceLkr: current.planPriceLkr,
          payments: paymentRows.map((p) => ({
            id: p.id,
            amountLkr: p.amountLkr,
            kind: p.kind,
            status: p.status,
            membershipId: p.membershipId,
          })),
          membershipId: current.id,
        })
      : null;

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold">{member.fullName}</h2>
            <p className="text-muted-foreground">{member.email}</p>
            {member.gymId !== null && (
              <p className="text-muted-foreground text-sm mt-1">
                Gym ID: <span className="font-mono font-medium">{member.gymId}</span>
              </p>
            )}
          </div>
          <Badge
            variant={
              member.status === "active"
                ? "default"
                : member.status === "pending"
                  ? "secondary"
                  : "outline"
            }
          >
            {member.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                {member.phone ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Joined:</span>{" "}
                {format(member.createdAt, "PP")}
              </div>
              <div>
                <span className="text-muted-foreground">Role:</span> {member.role}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Current membership</span>
                {outstanding && Number(outstanding) > 0 && (
                  <Badge variant="destructive">
                    Outstanding: LKR {Number(outstanding).toLocaleString()}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {current ? (
                <>
                  <div className="font-medium">{current.planName}</div>
                  <div className="text-muted-foreground">
                    {format(new Date(current.startDate), "PP")} –{" "}
                    {format(new Date(current.endDate), "PP")}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    Plan price: LKR{" "}
                    {Number(current.planPriceLkr).toLocaleString()}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No active membership.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Payments</h3>
            <RecordPaymentButton
              memberId={member.id}
              currentMembershipId={current?.id ?? null}
            />
          </div>
          <PaymentsTable
            rows={paymentRows}
            refundedReferences={refundedReferences}
          />
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
          <AttendanceTable rows={attendanceRows} />
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
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-6"
                  >
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
                    <Badge
                      variant={h.status === "active" ? "default" : "outline"}
                    >
                      {h.status}
                    </Badge>
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

- [ ] **Step 3: Build check**

  ```powershell
  npm run build
  ```

  Expected: success. If the build complains about `member.gymId` not existing, the schema migration didn't run — re-do Task 1 Step 3.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/app/admin/members/[id]/
  git commit -m "feat: admin member detail shows Gym ID and last 30 attendance rows"
  ```

---

## Task 8: Member portal — Gym ID badge + Attendance section

**Why:** Members need to know their Gym ID (to type at the kiosk) and see their own attendance history.

**Files:**
- Modify: `src/app/portal/page.tsx`

- [ ] **Step 1: Replace the portal page**

  Open `src/app/portal/page.tsx`. Replace it with:

  ```tsx
  import { redirect } from "next/navigation";
  import { requireMemberProfile } from "@/lib/auth";
  import { db } from "@/db";
  import { memberships, plans, payments, attendance } from "@/db/schema";
  import { eq, desc } from "drizzle-orm";
  import { format } from "date-fns";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { getCurrentMembership } from "@/lib/memberships/current";
  import { daysRemaining } from "@/lib/days-remaining";
  import { todayInSL } from "@/lib/tz";
  import { computeOutstanding } from "@/lib/payments/outstanding";

  export default async function PortalHome() {
    const me = await requireMemberProfile();

    if (me.role === "admin") redirect("/admin");

    if (me.status === "pending") {
      return (
        <Card className="max-w-md">
          <CardHeader><CardTitle>Welcome, {me.fullName} 👋</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>Welcome back, {me.fullName}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your account is currently inactive (no recent visits). Please drop by
              the front desk and we&apos;ll reactivate your membership.
            </p>
          </CardContent>
        </Card>
      );
    }

    const history = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
        planPriceLkr: plans.priceLkr,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, me.id));

    const today = todayInSL();
    const current = getCurrentMembership(history, today);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, me.id))
      .orderBy(desc(payments.paidAt));

    const attendanceRows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, me.id))
      .orderBy(desc(attendance.checkedInAt))
      .limit(30);

    const outstanding =
      current
        ? computeOutstanding({
            planPriceLkr: current.planPriceLkr,
            payments: paymentRows.map((p) => ({
              id: p.id,
              amountLkr: p.amountLkr,
              kind: p.kind,
              status: p.status,
              membershipId: p.membershipId,
            })),
            membershipId: current.id,
          })
        : null;

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex justify-between items-start">
          <h2 className="text-2xl font-semibold">Welcome, {me.fullName}</h2>
          {me.gymId !== null && (
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Your Gym ID
              </div>
              <div className="text-2xl font-mono font-semibold tabular-nums">
                {me.gymId}
              </div>
            </Card>
          )}
        </div>

        {outstanding && Number(outstanding) > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">
                Outstanding balance: LKR {Number(outstanding).toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Please visit the front desk to settle the balance.
            </CardContent>
          </Card>
        )}

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
              <div>
                <span className="text-muted-foreground">Plan price:</span>{" "}
                LKR {Number(current.planPriceLkr).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>No active membership</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Please visit the front desk to renew, or wait for the online payment option (coming soon).
            </CardContent>
          </Card>
        )}

        <div>
          <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Checked in at</TableHead>
                <TableHead className="w-32">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                    No check-ins yet. Type your Gym ID at the front-desk kiosk to mark attendance.
                  </TableCell>
                </TableRow>
              )}
              {attendanceRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{format(r.checkedInAt, "PPp")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {r.source === "kiosk_id" ? "Kiosk" : r.source === "qr_scan" ? "QR scan" : "Manual"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Payment history</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Paid at</TableHead>
                <TableHead className="w-28">Kind</TableHead>
                <TableHead className="w-28">Method</TableHead>
                <TableHead className="w-32 text-right">Amount (LKR)</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No payments yet.
                  </TableCell>
                </TableRow>
              )}
              {paymentRows.map((p) => {
                const num = Number(p.amountLkr);
                return (
                  <TableRow key={p.id} className={p.status === "refunded" ? "opacity-70" : ""}>
                    <TableCell>{format(p.paidAt, "PP")}</TableCell>
                    <TableCell>{p.kind}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-right">
                      {num < 0 ? "-" : ""}
                      {Math.abs(num).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "succeeded" ? "default" : "outline"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Build check**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 3: Commit**

  ```powershell
  git add src/app/portal/page.tsx
  git commit -m "feat: portal shows Gym ID badge and last 30 attendance rows"
  ```

---

## Task 9: End-to-end walkthrough + Phase 3 tag

**Why:** Verify the full Phase 3 surface works against the real Supabase DB and Clerk dev instance, then tag the milestone.

- [ ] **Step 1: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: all green (previous 92 + new Phase 3 tests).

- [ ] **Step 2: Build production bundle locally (not deploying)**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 3: Start dev server**

  ```powershell
  npm run dev
  ```

- [ ] **Step 4: Manual E2E**

  Open in separate browser windows / profiles:

  1. **Admin window** — sign in, approve a pending member (or use an existing one whose `gym_id` was backfilled by the migration). Confirm the member detail page now shows their Gym ID under their name.
  2. **Portal window** — sign in as that member. Confirm the Gym ID badge is visible at top right and the Attendance section says "No check-ins yet".
  3. **Kiosk window** — open `/checkin` in a private/incognito window (no Clerk session). Confirm the QR canvas renders and the Gym ID input is autofocused.
  4. Type the member's Gym ID → Submit. Expect green confirmation card with the member's name, plan, days remaining.
  5. Refresh the **Portal window** — confirm the new row appears in the Attendance table with source "Kiosk".
  6. Refresh the **Admin member-detail window** — confirm the same row appears in its Attendance section.
  7. Submit the same Gym ID again at the kiosk → expect red "Already checked in today" card.
  8. Type a non-existent Gym ID (e.g., 9876) → expect red "No member found" card.
  9. Stop the dev server.

- [ ] **Step 5: Tag the milestone**

  ```powershell
  git tag phase-3
  git push origin main --tags
  ```

- [ ] **Step 6: Done — update project memory**

  Update `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` with a Phase 3 status block: tag, what's shipped, what's deferred (mobile app, deploy).

---

## Self-Review

**Spec coverage:**

| Design section | Covered by |
|---|---|
| §2 `profiles.gym_id` column | Task 1 |
| §2 `attendance.source = 'kiosk_id'` | Task 1 |
| §3 routes & files | Tasks 0, 3a/3b, 5, 6, 7, 8 |
| §4 kiosk flow (form + rotating QR) | Task 5 |
| §5 eligibility check (5 reject reasons + ordering) | Task 3a + 3b |
| §6 error handling (DB error card, race re-query, public route, mobile-app token rules) | Task 5 (db_error card), Task 3b (single-insert race tolerated via app-level check), Task 6 (tamper/expired tests) |
| §7 testing (5 test files) | Tasks 0, 2, 3a, 3b, 4, 5, 6 |
| §8 migration backfill | Not needed in code — production has no active members yet. Local/dev DBs that already have active members get NULL `gym_id` until their next approval; the test fixtures explicitly set `gymId`. If this turns out to bite in dev, run a one-off SQL update manually. |
| §9 future work | Documented in design; not implemented |

**Type consistency:** `CheckinResult`, `CheckinRejectReason`, `Source`, `EvaluateMember`, `EvaluateMembership` are defined in `src/lib/checkin/evaluate.ts` and re-used by `record.ts`, the kiosk action, and the scan route. `SubmitGymIdResult` adds `invalid_format` + `db_error` on top of the eligibility reasons. Verified consistent in all task code blocks.

**Placeholders:** None — every step has runnable code.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time with review between each commit.*
