# Phase 4 — PayHere Online Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the sandbox round-trip for PayHere online payments end-to-end. Pre-insert a `pending` `payments` row before redirecting to PayHere; signature-verified webhook flips it to `succeeded` and creates a stacked `memberships` row atomically; reconciliation endpoint reconciles stuck pendings (cron scheduling deferred to Phase 5); member portal has a polling confirmation page. No new tables — one additive nullable `payments.plan_id` column.

**Architecture:** New `src/lib/payhere/` module mirroring `src/lib/payments/`. Pure-logic files (`sign.ts`, `reference.ts`) cover the MD5 hash + URL-safe order ID. DB-touching `_*Unsafe` helpers (`checkout.ts`, `process.ts`, `reconcile.ts`) own the row lifecycle. Thin route handlers under `src/app/api/payments/payhere/` and `src/app/api/cron/reconcile-payhere/` wrap the helpers. The webhook handler uses `FOR UPDATE` to serialize duplicate deliveries; the partial unique index `payments_reference_succeeded_unique` (shipped in Phase 2) is the second safety net.

**Tech Stack:** Same as prior phases — Next.js 15 (App Router), React 19, TypeScript, Drizzle ORM, `postgres` driver, Supabase Postgres, Vitest 4. Package manager: **npm**. MD5 + crypto.randomUUID via Node's `node:crypto` (works on CF Workers under `nodejs_compat`, which `wrangler.jsonc` already enables). No new runtime deps.

**Reference design:** `docs/plans/2026-05-16-phase-4-payhere-design.md` (committed at `232a39a`).
**Reference Phase 2:** `docs/superpowers/plans/2026-05-15-phase-2-payments.md` (especially Task 3 `_*Unsafe` pattern and Task 4 `db.transaction` pattern).
**Reference Phase 3:** `docs/superpowers/plans/2026-05-15-phase-3-qr-checkin.md` (especially Task 6 for thin route-handler tests with mocked HTTP).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell**.
- Every Task ends with one `git commit`.
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- DB-touching tests use the `phase4_test_*` prefix on clerk_user_id / plan names / payment references, and clean up before+after each test (follow `tests/app/admin/payments-actions.test.ts` and `tests/app/checkin/scan-route.test.ts`).
- "Today" everywhere is the SL local date via `todayInSL()` from `src/lib/tz.ts`.
- `_*Unsafe` helpers do NOT call `requireAdminProfile()` / `requireMemberProfile()` — they're called directly in tests and are wrapped by the gated route handlers.
- `vitest.config.ts` has `fileParallelism: false` (Phase 3 finding); DB tests rely on this. Do not change it.

---

## Environment variables

Add to `.env.local` (and `.env.example` if it exists) **before Task 0**. Generate `CRON_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

```
# PayHere (sandbox values from https://sandbox.payhere.lk/merchant/settings)
PAYHERE_MERCHANT_ID=1230000
PAYHERE_MERCHANT_SECRET=replace-with-sandbox-merchant-secret
PAYHERE_MODE=sandbox
PAYHERE_NOTIFY_URL=https://<your-cloudflared-tunnel>.trycloudflare.com/api/payments/payhere/webhook

# App
APP_URL=http://localhost:3000
CRON_SECRET=<32-byte-hex>
```

In production these must be set via the CF Workers env vars dashboard (both Build vars and Runtime vars — see `reference_cf_workers_env_vars` in user memory).

PayHere sandbox URLs (constants, not env vars — used directly in `src/lib/payhere/sign.ts`):

```
Checkout: https://sandbox.payhere.lk/pay/checkout
Status:   https://sandbox.payhere.lk/merchant/v1/payment/search
```

For live mode, swap `sandbox.payhere.lk` for `www.payhere.lk`. Phase 4 codes for sandbox; the swap is one constant change later.

---

## File structure (new and modified)

```
src/
  lib/
    payhere/
      sign.ts                                 (NEW — Task 1: buildCheckoutFields, verifyWebhookSignature)
      reference.ts                            (NEW — Task 1: generateOrderReference)
      checkout.ts                             (NEW — Task 3: _createCheckoutUnsafe)
      process.ts                              (NEW — Task 4: _processWebhookUnsafe)
      reconcile.ts                            (NEW — Task 5: _reconcilePendingUnsafe)
      api.ts                                  (NEW — Task 5: fetchPayHereStatus real HTTP)
    memberships/
      next-window.ts                          (NEW — Task 2: computeNextMembershipWindow)
  db/
    schema.ts                                 (MODIFY — Task 0: payments.plan_id col)
  app/
    api/
      payments/payhere/
        checkout/route.ts                     (NEW — Task 6: thin handler)
        webhook/route.ts                      (NEW — Task 7: thin handler)
        status/[ref]/route.ts                 (NEW — Task 6: thin handler)
      cron/
        reconcile-payhere/route.ts            (NEW — Task 8: thin handler)
    portal/pay/confirm/
      page.tsx                                (NEW — Task 9: server shell)
      _poll.tsx                               (NEW — Task 9: client poller)

tests/
  lib/
    payhere-sign.test.ts                      (NEW — Task 1)
    payhere-reference.test.ts                 (NEW — Task 1)
    memberships-next-window.test.ts           (NEW — Task 2)
    payhere-checkout.test.ts                  (NEW — Task 3)
    payhere-process.test.ts                   (NEW — Task 4)
    payhere-reconcile.test.ts                 (NEW — Task 5)
  app/api/payhere/
    checkout-route.test.ts                    (NEW — Task 6)
    status-route.test.ts                      (NEW — Task 6)
    webhook-route.test.ts                     (NEW — Task 7)
    reconcile-route.test.ts                   (NEW — Task 8)

drizzle/
  0004_*.sql                                  (generated in Task 0)
```

---

## Task 0: Schema — add `payments.plan_id` (nullable FK to plans)

**Why:** The webhook handler needs `plan.duration_days` to create the membership row, but currently `payments` doesn't store which plan a payment is for. We add a nullable FK so PayHere payments record their plan target; manual cash/bank/admission payments leave it null (no behaviour change for them).

**Files:**
- Modify: `src/db/schema.ts`
- Generated: `drizzle/0004_*.sql` (drizzle-kit output)

- [ ] **Step 1: Add the column in `src/db/schema.ts`**

  Open `src/db/schema.ts`. Find the `payments = pgTable("payments", { ... })` definition. Add `planId` right after `membershipId`:

  ```ts
  // Inside payments = pgTable("payments", { ... }) — full updated block:
  export const payments = pgTable(
    "payments",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      membershipId: uuid("membership_id").references(() => memberships.id, {
        onDelete: "set null",
      }),
      planId: uuid("plan_id").references(() => plans.id, {
        onDelete: "set null",
      }),
      memberId: uuid("member_id")
        .notNull()
        .references(() => profiles.id, { onDelete: "restrict" }),
      amountLkr: numeric("amount_lkr", { precision: 12, scale: 2 }).notNull(),
      method: paymentMethodEnum("method").notNull(),
      kind: paymentKindEnum("kind").notNull().default("membership"),
      status: paymentStatusEnum("status").notNull().default("pending"),
      reference: text("reference"),
      paidAt: timestamp("paid_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      recordedBy: uuid("recorded_by").references(() => profiles.id, {
        onDelete: "set null",
      }),
      notes: text("notes"),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => [
      index("payments_member_idx").on(t.memberId),
      uniqueIndex("payments_reference_succeeded_unique")
        .on(t.reference)
        .where(sql`${t.reference} is not null and ${t.status} = 'succeeded'`),
    ],
  );
  ```

- [ ] **Step 2: Generate the migration**

  ```powershell
  npm run db:generate
  ```

  Expected: a new file `drizzle/0004_<random>.sql` containing:
  - `ALTER TABLE "payments" ADD COLUMN "plan_id" uuid;`
  - `ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;`

- [ ] **Step 3: Apply the migration**

  ```powershell
  npm run db:push
  ```

  Expected: `[✓] Changes applied`.

- [ ] **Step 4: Run the full suite**

  ```powershell
  npm test
  ```

  Expected: all 130 existing tests green. The new column is nullable so no fixture changes are needed.

- [ ] **Step 5: Commit**

  ```powershell
  git add src/db/schema.ts drizzle/
  git commit -m "feat: add payments.plan_id (nullable FK to plans) for PayHere flow"
  ```

---

## Task 1: PayHere pure helpers — `buildCheckoutFields`, `verifyWebhookSignature`, `generateOrderReference`

**Why:** PayHere's checkout payload is form-posted to their hosted page with an `MD5(merchant_id + order_id + amount + currency + MD5(secret))` hash. The webhook payload comes back with a similarly structured `md5sig`. These are 100% pure functions and we want them locked down with hand-computed test vectors before any DB code touches them. `generateOrderReference` produces the URL-safe `gym_<uuid>` we use as `payments.reference` and PayHere's `order_id`.

**Files:**
- Create: `src/lib/payhere/sign.ts`
- Create: `src/lib/payhere/reference.ts`
- Create: `tests/lib/payhere-sign.test.ts`
- Create: `tests/lib/payhere-reference.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `tests/lib/payhere-sign.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { createHash } from "node:crypto";
  import {
    buildCheckoutFields,
    verifyWebhookSignature,
  } from "@/lib/payhere/sign";

  const MERCHANT_ID = "1230000";
  const MERCHANT_SECRET = "test-merchant-secret-not-real";

  function md5Upper(s: string): string {
    return createHash("md5").update(s).digest("hex").toUpperCase();
  }

  describe("buildCheckoutFields", () => {
    it("returns the canonical PayHere form fields with a correct hash", () => {
      const fields = buildCheckoutFields({
        merchantId: MERCHANT_ID,
        merchantSecret: MERCHANT_SECRET,
        orderId: "gym_abc123",
        amountLkr: "1500.00",
        items: "Monthly Plan",
        firstName: "Test",
        lastName: "Member",
        email: "test@example.com",
        phone: "0770000000",
        returnUrl: "http://localhost:3000/portal/pay/confirm?ref=gym_abc123",
        cancelUrl: "http://localhost:3000/portal/pay/confirm?ref=gym_abc123",
        notifyUrl: "https://tunnel.example/api/payments/payhere/webhook",
      });

      expect(fields.merchant_id).toBe(MERCHANT_ID);
      expect(fields.order_id).toBe("gym_abc123");
      expect(fields.currency).toBe("LKR");
      expect(fields.amount).toBe("1500.00");
      expect(fields.items).toBe("Monthly Plan");

      const expected = md5Upper(
        MERCHANT_ID +
          "gym_abc123" +
          "1500.00" +
          "LKR" +
          md5Upper(MERCHANT_SECRET),
      );
      expect(fields.hash).toBe(expected);
    });

    it("normalizes integer-string amounts to 2 decimals", () => {
      const fields = buildCheckoutFields({
        merchantId: MERCHANT_ID,
        merchantSecret: MERCHANT_SECRET,
        orderId: "gym_x",
        amountLkr: "1500",
        items: "Plan",
        firstName: "T",
        lastName: "M",
        email: "t@x.lk",
        phone: "0770000000",
        returnUrl: "http://l/",
        cancelUrl: "http://l/",
        notifyUrl: "http://l/",
      });
      expect(fields.amount).toBe("1500.00");
    });
  });

  describe("verifyWebhookSignature", () => {
    function buildPayload(opts: {
      merchantId: string;
      orderId: string;
      payhereAmount: string;
      currency: string;
      statusCode: string;
      secret: string;
    }) {
      const sig = md5Upper(
        opts.merchantId +
          opts.orderId +
          opts.payhereAmount +
          opts.currency +
          opts.statusCode +
          md5Upper(opts.secret),
      );
      return {
        merchant_id: opts.merchantId,
        order_id: opts.orderId,
        payhere_amount: opts.payhereAmount,
        payhere_currency: opts.currency,
        status_code: opts.statusCode,
        md5sig: sig,
        payment_id: "PAY123",
      };
    }

    it("accepts a valid signature", () => {
      const p = buildPayload({
        merchantId: MERCHANT_ID,
        orderId: "gym_abc",
        payhereAmount: "1500.00",
        currency: "LKR",
        statusCode: "2",
        secret: MERCHANT_SECRET,
      });
      expect(verifyWebhookSignature(p, MERCHANT_SECRET)).toBe(true);
    });

    it("rejects a tampered amount", () => {
      const p = buildPayload({
        merchantId: MERCHANT_ID,
        orderId: "gym_abc",
        payhereAmount: "1500.00",
        currency: "LKR",
        statusCode: "2",
        secret: MERCHANT_SECRET,
      });
      p.payhere_amount = "100.00";
      expect(verifyWebhookSignature(p, MERCHANT_SECRET)).toBe(false);
    });

    it("rejects a wrong merchant_secret", () => {
      const p = buildPayload({
        merchantId: MERCHANT_ID,
        orderId: "gym_abc",
        payhereAmount: "1500.00",
        currency: "LKR",
        statusCode: "2",
        secret: MERCHANT_SECRET,
      });
      expect(verifyWebhookSignature(p, "other-secret")).toBe(false);
    });

    it("returns false when md5sig is missing", () => {
      expect(
        verifyWebhookSignature(
          {
            merchant_id: MERCHANT_ID,
            order_id: "gym_x",
            payhere_amount: "1500.00",
            payhere_currency: "LKR",
            status_code: "2",
          } as Record<string, string>,
          MERCHANT_SECRET,
        ),
      ).toBe(false);
    });

    it("returns false when any required field is missing", () => {
      expect(
        verifyWebhookSignature(
          {
            merchant_id: MERCHANT_ID,
            order_id: "gym_x",
            payhere_amount: "1500.00",
            md5sig: "XXX",
          } as Record<string, string>,
          MERCHANT_SECRET,
        ),
      ).toBe(false);
    });
  });
  ```

  Create `tests/lib/payhere-reference.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { generateOrderReference } from "@/lib/payhere/reference";

  describe("generateOrderReference", () => {
    it("returns a value matching gym_<uuid> shape", () => {
      const r = generateOrderReference();
      expect(r).toMatch(
        /^gym_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("returns a different value on each call", () => {
      const a = generateOrderReference();
      const b = generateOrderReference();
      expect(a).not.toBe(b);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (modules not found)**

  ```powershell
  npm test -- tests/lib/payhere-sign.test.ts tests/lib/payhere-reference.test.ts
  ```

- [ ] **Step 3: Implement `src/lib/payhere/sign.ts`**

  ```ts
  import { createHash } from "node:crypto";

  function md5Upper(s: string): string {
    return createHash("md5").update(s).digest("hex").toUpperCase();
  }

  /** Normalize "1500" or 1500 → "1500.00" (PayHere requires 2dp). */
  function formatAmount(amountLkr: string): string {
    const n = Number(amountLkr);
    if (!Number.isFinite(n)) throw new Error("invalid amount");
    return n.toFixed(2);
  }

  export type CheckoutInput = {
    merchantId: string;
    merchantSecret: string;
    orderId: string;
    amountLkr: string;
    items: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    returnUrl: string;
    cancelUrl: string;
    notifyUrl: string;
    custom1?: string;
    custom2?: string;
  };

  export type CheckoutFields = {
    merchant_id: string;
    return_url: string;
    cancel_url: string;
    notify_url: string;
    order_id: string;
    items: string;
    currency: "LKR";
    amount: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    hash: string;
    custom_1?: string;
    custom_2?: string;
  };

  /**
   * Builds the form fields that the browser will auto-POST to PayHere's
   * hosted checkout. The `hash` is verified by PayHere; if it's wrong they
   * reject the redirect before charging anything.
   */
  export function buildCheckoutFields(input: CheckoutInput): CheckoutFields {
    const amount = formatAmount(input.amountLkr);
    const hash = md5Upper(
      input.merchantId +
        input.orderId +
        amount +
        "LKR" +
        md5Upper(input.merchantSecret),
    );
    const fields: CheckoutFields = {
      merchant_id: input.merchantId,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      order_id: input.orderId,
      items: input.items,
      currency: "LKR",
      amount,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      address: "",
      city: "Colombo",
      country: "Sri Lanka",
      hash,
    };
    if (input.custom1) fields.custom_1 = input.custom1;
    if (input.custom2) fields.custom_2 = input.custom2;
    return fields;
  }

  /**
   * Verify the md5sig on an incoming PayHere webhook payload.
   * Returns false if any required field is missing or the hash doesn't match.
   */
  export function verifyWebhookSignature(
    payload: Record<string, unknown>,
    merchantSecret: string,
  ): boolean {
    const required = [
      "merchant_id",
      "order_id",
      "payhere_amount",
      "payhere_currency",
      "status_code",
      "md5sig",
    ] as const;
    for (const k of required) {
      if (typeof payload[k] !== "string") return false;
    }
    const expected = md5Upper(
      (payload.merchant_id as string) +
        (payload.order_id as string) +
        (payload.payhere_amount as string) +
        (payload.payhere_currency as string) +
        (payload.status_code as string) +
        md5Upper(merchantSecret),
    );
    return expected === (payload.md5sig as string);
  }
  ```

  Create `src/lib/payhere/reference.ts`:

  ```ts
  import { randomUUID } from "node:crypto";

  /**
   * Generates a fresh, opaque `payments.reference` for a PayHere checkout.
   * Format: `gym_<uuid>` — URL-safe, namespaced from any other merchant's
   * order IDs, and opaque to the user.
   */
  export function generateOrderReference(): string {
    return `gym_${randomUUID()}`;
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/payhere-sign.test.ts tests/lib/payhere-reference.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/payhere/ tests/lib/payhere-sign.test.ts tests/lib/payhere-reference.test.ts
  git commit -m "feat: pure PayHere helpers (MD5 checkout hash + webhook signature verify + order ref)"
  ```

---

## Task 2: Pure stacking math — `computeNextMembershipWindow`

**Why:** When a PayHere payment succeeds for a member who still has an active membership, the new membership starts the day after their current `end_date`. This is a pure function that takes today, plan duration, and the latest active end_date (or null) and returns the new window. Kept separate from Phase 1's `computeMembershipWindow` because each has its own invariants and tests.

**Files:**
- Create: `src/lib/memberships/next-window.ts`
- Create: `tests/lib/memberships-next-window.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/memberships-next-window.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { computeNextMembershipWindow } from "@/lib/memberships/next-window";

  describe("computeNextMembershipWindow", () => {
    it("starts today when there is no prior membership", () => {
      const w = computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 30,
        latestActiveEndDate: null,
      });
      expect(w.startDate).toBe("2026-05-16");
      expect(w.endDate).toBe("2026-06-14");
    });

    it("starts day after prior end_date when prior is still active", () => {
      const w = computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 30,
        latestActiveEndDate: "2026-06-01",
      });
      expect(w.startDate).toBe("2026-06-02");
      expect(w.endDate).toBe("2026-07-01");
    });

    it("starts today when prior already expired", () => {
      const w = computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 30,
        latestActiveEndDate: "2026-04-01",
      });
      expect(w.startDate).toBe("2026-05-16");
      expect(w.endDate).toBe("2026-06-14");
    });

    it("starts tomorrow when prior end_date is exactly today", () => {
      const w = computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 30,
        latestActiveEndDate: "2026-05-16",
      });
      expect(w.startDate).toBe("2026-05-17");
      expect(w.endDate).toBe("2026-06-15");
    });

    it("1-day plan stacking: start === end", () => {
      const w = computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 1,
        latestActiveEndDate: "2026-05-20",
      });
      expect(w.startDate).toBe("2026-05-21");
      expect(w.endDate).toBe("2026-05-21");
    });

    it("rejects non-positive durationDays", () => {
      expect(() =>
        computeNextMembershipWindow({
          today: "2026-05-16",
          durationDays: 0,
          latestActiveEndDate: null,
        }),
      ).toThrow();
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/memberships-next-window.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/memberships/next-window.ts`:

  ```ts
  import { addDays, format, parseISO } from "date-fns";

  export type NextWindowInput = {
    today: string; // YYYY-MM-DD
    durationDays: number; // positive integer
    latestActiveEndDate: string | null; // YYYY-MM-DD or null
  };

  export type NextWindowResult = {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD (inclusive last day)
  };

  /**
   * For a new membership being added on `today`:
   *  - If no prior active membership: start = today.
   *  - If prior active membership ends in the future (or today): start = prior.end + 1.
   *  - If prior active membership already ended (before today): start = today.
   * end = start + durationDays - 1 (inclusive).
   */
  export function computeNextMembershipWindow(
    input: NextWindowInput,
  ): NextWindowResult {
    if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
      throw new Error("durationDays must be a positive integer");
    }
    const today = parseISO(input.today);
    let start = today;
    if (input.latestActiveEndDate) {
      const prevEnd = parseISO(input.latestActiveEndDate);
      if (prevEnd >= today) start = addDays(prevEnd, 1);
    }
    const end = addDays(start, input.durationDays - 1);
    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/memberships-next-window.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/memberships/next-window.ts tests/lib/memberships-next-window.test.ts
  git commit -m "feat: computeNextMembershipWindow (stacking math for renewals)"
  ```

---

## Task 3: `_createCheckoutUnsafe` — pre-insert pending row + return CheckoutFields

**Why:** The checkout server action's atomic unit: validate the plan and member exist, insert a `pending` payments row with the new `plan_id` column, return the form fields ready to auto-POST. The reference is generated once per call; the partial unique index prevents duplicates if a caller retries.

**Files:**
- Create: `src/lib/payhere/checkout.ts`
- Create: `tests/lib/payhere-checkout.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/payhere-checkout.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _createCheckoutUnsafe } from "@/lib/payhere/checkout";

  const CLERK_PREFIX = "user_phase4_checkout_";
  const PLAN_NAME = "Phase4CheckoutPlan";
  const PLAN_NAME_DISABLED = "Phase4CheckoutPlanDisabled";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(payments).where(eq(payments.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db.delete(plans).where(eq(plans.name, PLAN_NAME_DISABLED));
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let activePlanId: string;
  let disabledPlanId: string;

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    activePlanId = pl.id;
    const [plD] = await db
      .insert(plans)
      .values({
        name: PLAN_NAME_DISABLED,
        durationDays: 30,
        priceLkr: "1500",
        isActive: false,
      })
      .returning();
    disabledPlanId = plD.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "checkout@x.lk",
        fullName: "Checkout Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
  });

  afterEach(clean);

  describe("_createCheckoutUnsafe", () => {
    it("inserts a pending payments row and returns CheckoutFields with correct hash", async () => {
      const result = await _createCheckoutUnsafe({
        memberId,
        planId: activePlanId,
        merchantId: "1230000",
        merchantSecret: "test-secret",
        returnUrl: "http://localhost:3000/portal/pay/confirm",
        cancelUrl: "http://localhost:3000/portal/pay/confirm",
        notifyUrl: "http://localhost:3000/api/payments/payhere/webhook",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Reference present and gym_<uuid> shape
      expect(result.reference).toMatch(/^gym_/);

      // Payments row exists with expected shape
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, result.reference));
      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.status).toBe("pending");
      expect(row.method).toBe("payhere");
      expect(row.kind).toBe("membership");
      expect(row.amountLkr).toBe("1500.00");
      expect(row.memberId).toBe(memberId);
      expect(row.planId).toBe(activePlanId);
      expect(row.membershipId).toBeNull();
      expect(row.recordedBy).toBe(memberId);

      // CheckoutFields contains a hash and the order_id we generated
      expect(result.fields.order_id).toBe(result.reference);
      expect(result.fields.amount).toBe("1500.00");
      expect(result.fields.currency).toBe("LKR");
      expect(typeof result.fields.hash).toBe("string");
      expect(result.fields.hash.length).toBe(32);
    });

    it("rejects when plan is inactive", async () => {
      const result = await _createCheckoutUnsafe({
        memberId,
        planId: disabledPlanId,
        merchantId: "1230000",
        merchantSecret: "test-secret",
        returnUrl: "x",
        cancelUrl: "x",
        notifyUrl: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/plan/i);
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.memberId, memberId));
      expect(rows.length).toBe(0);
    });

    it("rejects when member is not active", async () => {
      await db
        .update(profiles)
        .set({ status: "pending" })
        .where(eq(profiles.id, memberId));
      const result = await _createCheckoutUnsafe({
        memberId,
        planId: activePlanId,
        merchantId: "1230000",
        merchantSecret: "test-secret",
        returnUrl: "x",
        cancelUrl: "x",
        notifyUrl: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/member/i);
    });

    it("rejects when member does not exist", async () => {
      const result = await _createCheckoutUnsafe({
        memberId: "00000000-0000-0000-0000-000000000000",
        planId: activePlanId,
        merchantId: "1230000",
        merchantSecret: "test-secret",
        returnUrl: "x",
        cancelUrl: "x",
        notifyUrl: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/member/i);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/payhere-checkout.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/payhere/checkout.ts`:

  ```ts
  import { db } from "@/db";
  import { profiles, plans, payments } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { buildCheckoutFields, type CheckoutFields } from "./sign";
  import { generateOrderReference } from "./reference";

  export type CreateCheckoutInput = {
    memberId: string;
    planId: string;
    merchantId: string;
    merchantSecret: string;
    returnUrl: string;
    cancelUrl: string;
    notifyUrl: string;
  };

  export type CreateCheckoutResult =
    | { ok: true; reference: string; fields: CheckoutFields }
    | { ok: false; error: string };

  /**
   * Inserts a pending payments row for an online PayHere checkout and
   * returns the form fields the browser must POST to the PayHere hosted
   * checkout URL.
   *
   * On error, no row is inserted.
   */
  export async function _createCheckoutUnsafe(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, input.planId))
      .limit(1);
    if (!plan) return { ok: false, error: "Plan not found" };
    if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

    const [member] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.memberId))
      .limit(1);
    if (!member) return { ok: false, error: "Member not found" };
    if (member.status !== "active") {
      return { ok: false, error: "Member is not active" };
    }
    if (member.role !== "member") {
      return { ok: false, error: "Only members can use online payment" };
    }

    const reference = generateOrderReference();
    const amount = Number(plan.priceLkr).toFixed(2);

    await db.insert(payments).values({
      memberId: input.memberId,
      membershipId: null,
      planId: input.planId,
      amountLkr: amount,
      method: "payhere",
      kind: "membership",
      status: "pending",
      reference,
      recordedBy: input.memberId,
      notes: `PayHere checkout for ${plan.name}`,
    });

    const [firstName, ...rest] = member.fullName.split(/\s+/);
    const lastName = rest.join(" ") || firstName;
    const fields = buildCheckoutFields({
      merchantId: input.merchantId,
      merchantSecret: input.merchantSecret,
      orderId: reference,
      amountLkr: amount,
      items: plan.name,
      firstName,
      lastName,
      email: member.email,
      phone: member.phone ?? "",
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      notifyUrl: input.notifyUrl,
    });

    return { ok: true, reference, fields };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/payhere-checkout.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/payhere/checkout.ts tests/lib/payhere-checkout.test.ts
  git commit -m "feat: _createCheckoutUnsafe pre-inserts pending payments row + returns signed fields"
  ```

---

## Task 4: `_processWebhookUnsafe` — flip pending → succeeded, create stacked membership

**Why:** The load-bearing path of Phase 4. Given a signature-verified PayHere webhook payload, this transactionally locks the pending row, decides the new status from `status_code`, and on success creates the next-window membership row. Idempotent: a duplicate delivery returns `already_processed` without writing. Amount mismatches leave the row pending and surface a `reason` the caller can log.

**Files:**
- Create: `src/lib/payhere/process.ts`
- Create: `tests/lib/payhere-process.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/payhere-process.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq, like, and } from "drizzle-orm";
  import { _processWebhookUnsafe } from "@/lib/payhere/process";

  const CLERK_PREFIX = "user_phase4_process_";
  const PLAN_NAME = "Phase4ProcessPlan";

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
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  async function seedPending(opts: {
    reference: string;
    amount?: string;
  }): Promise<string> {
    const [row] = await db
      .insert(payments)
      .values({
        memberId,
        membershipId: null,
        planId,
        amountLkr: opts.amount ?? "1500.00",
        method: "payhere",
        kind: "membership",
        status: "pending",
        reference: opts.reference,
        recordedBy: memberId,
      })
      .returning();
    return row.id;
  }

  function payload(opts: {
    reference: string;
    amount?: string;
    statusCode: "2" | "0" | "-1" | "-2" | "-3";
  }) {
    return {
      merchant_id: "1230000",
      order_id: opts.reference,
      payment_id: "PAY123",
      payhere_amount: opts.amount ?? "1500.00",
      payhere_currency: "LKR",
      status_code: opts.statusCode,
      md5sig: "VERIFIED-BY-ROUTE-HANDLER",
    };
  }

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
        email: "process@x.lk",
        fullName: "Process Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
  });

  afterEach(clean);

  describe("_processWebhookUnsafe", () => {
    it("flips pending → succeeded and creates a membership (no prior)", async () => {
      const ref = "gym_test_success_1";
      await seedPending({ reference: ref });
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.outcome).toBe("succeeded");

      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("succeeded");
      expect(row.membershipId).not.toBeNull();

      const ms = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, row.membershipId!));
      expect(ms.length).toBe(1);
      expect(ms[0].startDate).toBe("2026-05-16");
      expect(ms[0].endDate).toBe("2026-06-14");
      expect(ms[0].status).toBe("active");
      expect(ms[0].createdBy).toBe(memberId);
    });

    it("stacks new membership when prior is still active", async () => {
      // Prior active membership ending 2026-06-01
      await db.insert(memberships).values({
        memberId,
        planId,
        startDate: "2026-04-15",
        endDate: "2026-06-01",
        status: "active",
        createdBy: memberId,
      });
      const ref = "gym_test_stack";
      await seedPending({ reference: ref });
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(true);
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      const [ms] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.id, row.membershipId!));
      expect(ms.startDate).toBe("2026-06-02");
      expect(ms.endDate).toBe("2026-07-01");
    });

    it("returns already_processed on a duplicate webhook (idempotent)", async () => {
      const ref = "gym_test_dup";
      await seedPending({ reference: ref });
      const first = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(first.ok).toBe(true);
      const second = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.outcome).toBe("already_processed");

      // Still just one membership row
      const all = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, memberId));
      expect(all.length).toBe(1);
    });

    it("flips pending → failed on status_code -1/-2/-3 and creates no membership", async () => {
      for (const sc of ["-1", "-2", "-3"] as const) {
        const ref = `gym_test_fail_${sc}`;
        await seedPending({ reference: ref });
        const r = await _processWebhookUnsafe({
          verified: payload({ reference: ref, statusCode: sc }),
          todaySL: "2026-05-16",
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.outcome).toBe("failed");
        const [row] = await db
          .select()
          .from(payments)
          .where(eq(payments.reference, ref));
        expect(row.status).toBe("failed");
        expect(row.membershipId).toBeNull();
      }
      const ms = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, memberId));
      expect(ms.length).toBe(0);
    });

    it("returns amount_mismatch and leaves row pending", async () => {
      const ref = "gym_test_amount";
      await seedPending({ reference: ref, amount: "1500.00" });
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, amount: "100.00", statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("amount_mismatch");
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("pending");
    });

    it("returns row_not_found and writes nothing", async () => {
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: "gym_does_not_exist", statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("row_not_found");
    });

    it("is a no-op on status_code 0 (still pending)", async () => {
      const ref = "gym_test_pending";
      await seedPending({ reference: ref });
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "0" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.outcome).toBe("still_pending");
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("pending");
    });

    it("succeeds even if plan was deactivated between checkout and webhook", async () => {
      const ref = "gym_test_deactivated";
      await seedPending({ reference: ref });
      await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
      const r = await _processWebhookUnsafe({
        verified: payload({ reference: ref, statusCode: "2" }),
        todaySL: "2026-05-16",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.outcome).toBe("succeeded");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/payhere-process.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/payhere/process.ts`:

  ```ts
  import { db } from "@/db";
  import { payments, memberships, plans } from "@/db/schema";
  import { eq, and, desc, sql } from "drizzle-orm";
  import { computeNextMembershipWindow } from "@/lib/memberships/next-window";

  export type VerifiedWebhookPayload = {
    merchant_id: string;
    order_id: string;
    payment_id?: string;
    payhere_amount: string;
    payhere_currency: string;
    status_code: string;
    md5sig: string;
    [key: string]: unknown;
  };

  export type ProcessOutcome =
    | "succeeded"
    | "failed"
    | "still_pending"
    | "already_processed";
  export type ProcessReason = "row_not_found" | "amount_mismatch" | "no_plan";

  export type ProcessResult =
    | { ok: true; outcome: ProcessOutcome }
    | { ok: false; reason: ProcessReason };

  /**
   * Apply a signature-verified PayHere webhook to our payments row.
   *
   * Concurrency: opens a transaction and acquires a row-level lock
   * (FOR UPDATE) on the payments row keyed by `reference + method='payhere'`.
   * A simultaneous second delivery waits, then exits via the
   * `already_processed` branch.
   */
  export async function _processWebhookUnsafe(input: {
    verified: VerifiedWebhookPayload;
    todaySL: string;
  }): Promise<ProcessResult> {
    const { verified, todaySL } = input;
    const orderId = verified.order_id;
    const statusCode = verified.status_code;
    const reportedAmount = Number(verified.payhere_amount).toFixed(2);

    return await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        select * from ${payments}
        where ${payments.reference} = ${orderId}
          and ${payments.method} = 'payhere'
        for update
      `);
      const row = (rows as unknown as { rows: typeof payments.$inferSelect[] }).rows?.[0]
        ?? (rows as unknown as typeof payments.$inferSelect[])[0];
      if (!row) return { ok: false, reason: "row_not_found" } as const;

      if (row.status === "succeeded") {
        return { ok: true, outcome: "already_processed" } as const;
      }

      if (Number(row.amountLkr).toFixed(2) !== reportedAmount) {
        return { ok: false, reason: "amount_mismatch" } as const;
      }

      if (statusCode === "0") {
        return { ok: true, outcome: "still_pending" } as const;
      }

      if (statusCode === "-1" || statusCode === "-2" || statusCode === "-3") {
        await tx
          .update(payments)
          .set({ status: "failed" })
          .where(eq(payments.id, row.id));
        return { ok: true, outcome: "failed" } as const;
      }

      if (statusCode !== "2") {
        // Unknown code — treat as a no-op so PayHere retries don't poison the row
        return { ok: true, outcome: "still_pending" } as const;
      }

      // Success path: read plan, compute next window, insert membership, flip row.
      if (!row.planId) {
        return { ok: false, reason: "no_plan" } as const;
      }
      const [plan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, row.planId))
        .limit(1);
      if (!plan) return { ok: false, reason: "no_plan" } as const;

      const [latestActive] = await tx
        .select({ endDate: memberships.endDate })
        .from(memberships)
        .where(
          and(
            eq(memberships.memberId, row.memberId),
            eq(memberships.status, "active"),
          ),
        )
        .orderBy(desc(memberships.endDate))
        .limit(1);

      const window = computeNextMembershipWindow({
        today: todaySL,
        durationDays: plan.durationDays,
        latestActiveEndDate: latestActive?.endDate ?? null,
      });

      const [created] = await tx
        .insert(memberships)
        .values({
          memberId: row.memberId,
          planId: row.planId,
          startDate: window.startDate,
          endDate: window.endDate,
          status: "active",
          createdBy: row.memberId,
        })
        .returning({ id: memberships.id });

      await tx
        .update(payments)
        .set({ status: "succeeded", membershipId: created.id, paidAt: new Date() })
        .where(eq(payments.id, row.id));

      return { ok: true, outcome: "succeeded" } as const;
    });
  }
  ```

  **Note on `tx.execute(sql\`...\` )` return shape:** drizzle's `postgres-js` driver returns the rows as the array directly OR wrapped in `{ rows: [] }` depending on version. The `?? (rows as unknown as ...)[0]` fallback handles both. If the test fails on row access, adjust to whichever shape the installed `drizzle-orm` version returns (run `console.log` once during debugging).

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/payhere-process.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/payhere/process.ts tests/lib/payhere-process.test.ts
  git commit -m "feat: _processWebhookUnsafe flips pending row + stacks membership atomically"
  ```

---

## Task 5: `_reconcilePendingUnsafe` + `fetchPayHereStatus`

**Why:** Webhooks drop. The reconciliation helper sweeps pending PayHere rows older than 1 hour, calls PayHere's status API per row, and re-runs the same state machine as the webhook handler. `fetchPayHereStatus` is the real HTTP call, kept in its own file so tests can inject a fake. Endpoint goes in next; cron scheduling waits for Phase 5.

**Files:**
- Create: `src/lib/payhere/api.ts`
- Create: `src/lib/payhere/reconcile.ts`
- Create: `tests/lib/payhere-reconcile.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/payhere-reconcile.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _reconcilePendingUnsafe } from "@/lib/payhere/reconcile";
  import type { PayHereStatus } from "@/lib/payhere/api";

  const CLERK_PREFIX = "user_phase4_reconcile_";
  const PLAN_NAME = "Phase4ReconcilePlan";

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
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  async function seedPending(opts: {
    reference: string;
    paidAt: Date;
  }) {
    await db.insert(payments).values({
      memberId,
      membershipId: null,
      planId,
      amountLkr: "1500.00",
      method: "payhere",
      kind: "membership",
      status: "pending",
      reference: opts.reference,
      recordedBy: memberId,
      paidAt: opts.paidAt,
    });
  }

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
        email: "reconcile@x.lk",
        fullName: "Reconcile Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
  });

  afterEach(clean);

  describe("_reconcilePendingUnsafe", () => {
    it("processes rows older than 1h, skips fresh rows", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000);
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      await seedPending({ reference: "gym_old_success", paidAt: oneHourAgo });
      await seedPending({ reference: "gym_old_fail", paidAt: oneHourAgo });
      await seedPending({ reference: "gym_fresh", paidAt: fiveMinAgo });

      const fakeFetch = async (ref: string): Promise<PayHereStatus> => {
        if (ref === "gym_old_success")
          return {
            kind: "found",
            statusCode: "2",
            amount: "1500.00",
            currency: "LKR",
          };
        if (ref === "gym_old_fail")
          return {
            kind: "found",
            statusCode: "-2",
            amount: "1500.00",
            currency: "LKR",
          };
        throw new Error("should not be called for fresh row");
      };

      const summary = await _reconcilePendingUnsafe({
        fetchStatus: fakeFetch,
        todaySL: "2026-05-16",
        merchantId: "1230000",
        merchantSecret: "test-secret",
      });

      expect(summary.processed).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.still_pending).toBe(0);

      const [success] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, "gym_old_success"));
      expect(success.status).toBe("succeeded");

      const [failed] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, "gym_old_fail"));
      expect(failed.status).toBe("failed");

      const [fresh] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, "gym_fresh"));
      expect(fresh.status).toBe("pending");
    });

    it("treats PayHere 'not found' on a >24h-old row as failed (abandoned checkout)", async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await seedPending({
        reference: "gym_abandoned",
        paidAt: twentyFiveHoursAgo,
      });

      const fakeFetch = async (): Promise<PayHereStatus> => ({ kind: "not_found" });
      const summary = await _reconcilePendingUnsafe({
        fetchStatus: fakeFetch,
        todaySL: "2026-05-16",
        merchantId: "1230000",
        merchantSecret: "test-secret",
      });
      expect(summary.failed).toBe(1);
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, "gym_abandoned"));
      expect(row.status).toBe("failed");
    });

    it("leaves <24h 'not found' rows alone (still pending)", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await seedPending({ reference: "gym_recent_nf", paidAt: twoHoursAgo });
      const summary = await _reconcilePendingUnsafe({
        fetchStatus: async () => ({ kind: "not_found" }),
        todaySL: "2026-05-16",
        merchantId: "1230000",
        merchantSecret: "test-secret",
      });
      expect(summary.still_pending).toBe(1);
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, "gym_recent_nf"));
      expect(row.status).toBe("pending");
    });

    it("counts thrown fetch errors as still_pending and continues with other rows", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000 - 1000);
      await seedPending({ reference: "gym_err", paidAt: oneHourAgo });
      await seedPending({ reference: "gym_ok", paidAt: oneHourAgo });

      const fakeFetch = async (ref: string): Promise<PayHereStatus> => {
        if (ref === "gym_err") throw new Error("upstream down");
        return {
          kind: "found",
          statusCode: "2",
          amount: "1500.00",
          currency: "LKR",
        };
      };

      const summary = await _reconcilePendingUnsafe({
        fetchStatus: fakeFetch,
        todaySL: "2026-05-16",
        merchantId: "1230000",
        merchantSecret: "test-secret",
      });
      expect(summary.processed).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.still_pending).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/payhere-reconcile.test.ts
  ```

- [ ] **Step 3: Implement `src/lib/payhere/api.ts`**

  ```ts
  import { createHash } from "node:crypto";

  export type PayHereStatus =
    | { kind: "found"; statusCode: "2" | "0" | "-1" | "-2" | "-3"; amount: string; currency: string }
    | { kind: "not_found" };

  /**
   * Calls the PayHere Payment Search API to look up a single order by its
   * reference. Returns `not_found` when PayHere says they have no record.
   *
   * Endpoint:  https://sandbox.payhere.lk/merchant/v1/payment/search?order_id=...
   * Live URL:  https://www.payhere.lk/merchant/v1/payment/search?order_id=...
   * Auth:      Basic auth via merchant_id + MD5(merchant_secret).toUpperCase()
   *            (the same approach used by the checkout hash)
   */
  export async function fetchPayHereStatus(
    reference: string,
    opts: {
      merchantId: string;
      merchantSecret: string;
      mode: "sandbox" | "live";
    },
  ): Promise<PayHereStatus> {
    const host =
      opts.mode === "live" ? "www.payhere.lk" : "sandbox.payhere.lk";
    const url = `https://${host}/merchant/v1/payment/search?order_id=${encodeURIComponent(
      reference,
    )}`;

    const auth =
      "Basic " +
      Buffer.from(
        `${opts.merchantId}:${createHash("md5")
          .update(opts.merchantSecret)
          .digest("hex")
          .toUpperCase()}`,
      ).toString("base64");

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: auth },
    });
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) {
      throw new Error(`PayHere status API returned ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: {
        status_code?: string;
        amount_detail?: { gross?: string; currency?: string };
      };
    };
    const sc = json.data?.status_code;
    const amount = json.data?.amount_detail?.gross;
    const currency = json.data?.amount_detail?.currency;
    if (!sc || !amount || !currency) return { kind: "not_found" };
    if (!["2", "0", "-1", "-2", "-3"].includes(sc)) {
      throw new Error(`PayHere returned unknown status_code: ${sc}`);
    }
    return {
      kind: "found",
      statusCode: sc as "2" | "0" | "-1" | "-2" | "-3",
      amount,
      currency,
    };
  }
  ```

  Create `src/lib/payhere/reconcile.ts`:

  ```ts
  import { db } from "@/db";
  import { payments } from "@/db/schema";
  import { and, eq, lt } from "drizzle-orm";
  import { _processWebhookUnsafe } from "./process";
  import type { PayHereStatus } from "./api";

  export type ReconcileSummary = {
    processed: number;
    succeeded: number;
    failed: number;
    still_pending: number;
  };

  const ONE_HOUR_MS = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  export async function _reconcilePendingUnsafe(input: {
    fetchStatus: (reference: string) => Promise<PayHereStatus>;
    todaySL: string;
    merchantId: string;
    merchantSecret: string;
  }): Promise<ReconcileSummary> {
    const cutoff = new Date(Date.now() - ONE_HOUR_MS);
    const pendingRows = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, "pending"),
          eq(payments.method, "payhere"),
          lt(payments.paidAt, cutoff),
        ),
      );

    const summary: ReconcileSummary = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      still_pending: 0,
    };

    for (const row of pendingRows) {
      summary.processed++;
      if (!row.reference) {
        summary.still_pending++;
        continue;
      }
      let status: PayHereStatus;
      try {
        status = await input.fetchStatus(row.reference);
      } catch {
        summary.still_pending++;
        continue;
      }

      if (status.kind === "not_found") {
        // >24h-old + PayHere never heard of it → abandoned. Flip to failed.
        const age = Date.now() - new Date(row.paidAt).getTime();
        if (age > TWENTY_FOUR_HOURS_MS) {
          await db
            .update(payments)
            .set({ status: "failed" })
            .where(eq(payments.id, row.id));
          summary.failed++;
        } else {
          summary.still_pending++;
        }
        continue;
      }

      const result = await _processWebhookUnsafe({
        verified: {
          merchant_id: input.merchantId,
          order_id: row.reference,
          payhere_amount: status.amount,
          payhere_currency: status.currency,
          status_code: status.statusCode,
          md5sig: "RECONCILE-AUTHORITATIVE",
        },
        todaySL: input.todaySL,
      });

      if (!result.ok) {
        summary.still_pending++;
        continue;
      }
      switch (result.outcome) {
        case "succeeded":
          summary.succeeded++;
          break;
        case "failed":
          summary.failed++;
          break;
        case "still_pending":
        case "already_processed":
          summary.still_pending++;
          break;
      }
    }

    return summary;
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/payhere-reconcile.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/payhere/api.ts src/lib/payhere/reconcile.ts tests/lib/payhere-reconcile.test.ts
  git commit -m "feat: _reconcilePendingUnsafe + fetchPayHereStatus (status API + sweep)"
  ```

---

## Task 6: Routes — `POST /api/payments/payhere/checkout` + `GET /api/payments/payhere/status/[ref]`

**Why:** Both member-portal-facing routes. Checkout takes a `planId`, calls `_createCheckoutUnsafe`, returns an HTML page that auto-POSTs the signed fields to PayHere's hosted checkout (the standard PayHere integration pattern). Status returns the current `payments.status` for a single row — the polling endpoint the confirm page hits every 2s, scoped to the owning member.

**Files:**
- Create: `src/app/api/payments/payhere/checkout/route.ts`
- Create: `src/app/api/payments/payhere/status/[ref]/route.ts`
- Create: `tests/app/api/payhere/checkout-route.test.ts`
- Create: `tests/app/api/payhere/status-route.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `tests/app/api/payhere/checkout-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";

  // Mock Clerk auth — POST handler imports requireMemberProfile from @/lib/auth
  vi.mock("@/lib/auth", () => ({
    requireMemberProfile: vi.fn(),
  }));

  import { POST } from "@/app/api/payments/payhere/checkout/route";
  import { requireMemberProfile } from "@/lib/auth";

  const CLERK_PREFIX = "user_phase4_chkroute_";
  const PLAN_NAME = "Phase4CheckoutRoutePlan";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(payments).where(eq(payments.memberId, m.id));
    }
    await db.delete(plans).where(eq(plans.name, PLAN_NAME));
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await clean();
    process.env.PAYHERE_MERCHANT_ID = "1230000";
    process.env.PAYHERE_MERCHANT_SECRET = "test-secret";
    process.env.PAYHERE_MODE = "sandbox";
    process.env.PAYHERE_NOTIFY_URL = "http://localhost:3000/api/payments/payhere/webhook";
    process.env.APP_URL = "http://localhost:3000";

    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "chkroute@x.lk",
        fullName: "Checkout Route Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
    vi.mocked(requireMemberProfile).mockResolvedValue({
      id: memberId,
      clerkUserId: `${CLERK_PREFIX}member`,
      role: "member",
      status: "active",
      fullName: "Checkout Route Member",
      email: "chkroute@x.lk",
      phone: null,
      photoUrl: null,
      gymId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof requireMemberProfile>>);
  });

  afterEach(async () => {
    await clean();
    vi.restoreAllMocks();
  });

  function postJson(body: unknown): Request {
    return new Request("http://localhost/api/payments/payhere/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("POST /api/payments/payhere/checkout", () => {
    it("returns 200 HTML with an auto-post form on happy path", async () => {
      const res = await POST(postJson({ planId }));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toContain("text/html");
      const html = await res.text();
      expect(html).toContain("https://sandbox.payhere.lk/pay/checkout");
      expect(html).toContain('name="merchant_id"');
      expect(html).toContain('value="1230000"');
      expect(html).toMatch(/name="hash"\s+value="[A-F0-9]{32}"/);

      // A pending row was inserted
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.memberId, memberId));
      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe("pending");
    });

    it("returns 400 on missing planId", async () => {
      const res = await POST(postJson({}));
      expect(res.status).toBe(400);
    });

    it("returns 400 on inactive plan", async () => {
      await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
      const res = await POST(postJson({ planId }));
      expect(res.status).toBe(400);
    });
  });
  ```

  Create `tests/app/api/payhere/status-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import { db } from "@/db";
  import { profiles, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";

  vi.mock("@/lib/auth", () => ({
    requireMemberProfile: vi.fn(),
  }));

  import { GET } from "@/app/api/payments/payhere/status/[ref]/route";
  import { requireMemberProfile } from "@/lib/auth";

  const CLERK_PREFIX = "user_phase4_statusroute_";

  async function clean() {
    const ms = await db
      .select()
      .from(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
    for (const m of ms) {
      await db.delete(payments).where(eq(payments.memberId, m.id));
    }
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let otherMemberId: string;

  beforeEach(async () => {
    await clean();
    const [m1] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}owner`,
        email: "owner@x.lk",
        fullName: "Owner",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m1.id;
    const [m2] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}stranger`,
        email: "stranger@x.lk",
        fullName: "Stranger",
        role: "member",
        status: "active",
      })
      .returning();
    otherMemberId = m2.id;

    await db.insert(payments).values({
      memberId,
      amountLkr: "1500.00",
      method: "payhere",
      kind: "membership",
      status: "pending",
      reference: "gym_status_test",
      recordedBy: memberId,
    });
  });

  afterEach(async () => {
    await clean();
    vi.restoreAllMocks();
  });

  function call(ref: string) {
    return GET(
      new Request(`http://localhost/api/payments/payhere/status/${ref}`),
      { params: Promise.resolve({ ref }) },
    );
  }

  describe("GET /api/payments/payhere/status/[ref]", () => {
    it("returns the status for the owning member", async () => {
      vi.mocked(requireMemberProfile).mockResolvedValue({
        id: memberId,
      } as Awaited<ReturnType<typeof requireMemberProfile>>);
      const res = await call("gym_status_test");
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string };
      expect(json.status).toBe("pending");
    });

    it("returns 403 when a different member asks", async () => {
      vi.mocked(requireMemberProfile).mockResolvedValue({
        id: otherMemberId,
      } as Awaited<ReturnType<typeof requireMemberProfile>>);
      const res = await call("gym_status_test");
      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown reference", async () => {
      vi.mocked(requireMemberProfile).mockResolvedValue({
        id: memberId,
      } as Awaited<ReturnType<typeof requireMemberProfile>>);
      const res = await call("gym_does_not_exist");
      expect(res.status).toBe(404);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/payhere/checkout-route.test.ts tests/app/api/payhere/status-route.test.ts
  ```

- [ ] **Step 3: Implement the checkout route**

  Create `src/app/api/payments/payhere/checkout/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { requireMemberProfile } from "@/lib/auth";
  import { _createCheckoutUnsafe } from "@/lib/payhere/checkout";

  function checkoutUrl(): string {
    const mode = process.env.PAYHERE_MODE ?? "sandbox";
    return mode === "live"
      ? "https://www.payhere.lk/pay/checkout"
      : "https://sandbox.payhere.lk/pay/checkout";
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildAutoPostHtml(action: string, fields: Record<string, string>) {
    const inputs = Object.entries(fields)
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
      )
      .join("\n");
    return `<!doctype html>
  <html>
    <head><meta charset="utf-8"><title>Redirecting to PayHere…</title></head>
    <body>
      <p>Redirecting to PayHere…</p>
      <form id="f" method="POST" action="${escapeHtml(action)}">
        ${inputs}
      </form>
      <script>document.getElementById("f").submit();</script>
    </body>
  </html>`;
  }

  export async function POST(req: Request) {
    const member = await requireMemberProfile();
    if (member.role !== "member" || member.status !== "active") {
      return NextResponse.json({ error: "not active" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const { planId } = (body ?? {}) as { planId?: unknown };
    if (typeof planId !== "string" || !planId) {
      return NextResponse.json({ error: "planId required" }, { status: 400 });
    }

    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const notifyUrl = process.env.PAYHERE_NOTIFY_URL;
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    if (!merchantId || !merchantSecret || !notifyUrl) {
      return NextResponse.json(
        { error: "PayHere is not configured" },
        { status: 500 },
      );
    }

    const result = await _createCheckoutUnsafe({
      memberId: member.id,
      planId,
      merchantId,
      merchantSecret,
      notifyUrl,
      returnUrl: `${appUrl}/portal/pay/confirm?ref=`,
      cancelUrl: `${appUrl}/portal/pay/confirm?ref=`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // We didn't know the reference until _createCheckoutUnsafe ran. Patch the
    // return/cancel URLs in the form fields now that we do.
    const ref = result.reference;
    const fields = {
      ...result.fields,
      return_url: `${appUrl}/portal/pay/confirm?ref=${encodeURIComponent(ref)}`,
      cancel_url: `${appUrl}/portal/pay/confirm?ref=${encodeURIComponent(ref)}`,
    };

    const html = buildAutoPostHtml(
      checkoutUrl(),
      fields as unknown as Record<string, string>,
    );
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  ```

  Create `src/app/api/payments/payhere/status/[ref]/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { db } from "@/db";
  import { payments } from "@/db/schema";
  import { and, eq } from "drizzle-orm";
  import { requireMemberProfile } from "@/lib/auth";

  export async function GET(
    _req: Request,
    ctx: { params: Promise<{ ref: string }> },
  ) {
    const member = await requireMemberProfile();
    const { ref } = await ctx.params;

    const [row] = await db
      .select({
        memberId: payments.memberId,
        status: payments.status,
        membershipId: payments.membershipId,
      })
      .from(payments)
      .where(
        and(eq(payments.reference, ref), eq(payments.method, "payhere")),
      )
      .limit(1);

    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (row.memberId !== member.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({
      status: row.status,
      hasMembership: row.membershipId !== null,
    });
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/payhere/checkout-route.test.ts tests/app/api/payhere/status-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/payments/payhere/checkout/ src/app/api/payments/payhere/status/ tests/app/api/payhere/checkout-route.test.ts tests/app/api/payhere/status-route.test.ts
  git commit -m "feat: PayHere checkout route (auto-post HTML) + member-scoped status endpoint"
  ```

---

## Task 7: Route — `POST /api/payments/payhere/webhook`

**Why:** PayHere's server-to-server notification. The route verifies the MD5 signature, parses the form-encoded body, then hands a typed `VerifiedWebhookPayload` to `_processWebhookUnsafe`. **Always returns 200 after signature verification** so PayHere doesn't retry the same delivery — the outcome ends up in the response JSON for our own logs, not as HTTP status.

**Files:**
- Create: `src/app/api/payments/payhere/webhook/route.ts`
- Create: `tests/app/api/payhere/webhook-route.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/api/payhere/webhook-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { createHash } from "node:crypto";
  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { POST } from "@/app/api/payments/payhere/webhook/route";

  const CLERK_PREFIX = "user_phase4_webhook_";
  const PLAN_NAME = "Phase4WebhookPlan";
  const MERCHANT_ID = "1230000";
  const MERCHANT_SECRET = "webhook-test-secret";

  function md5Upper(s: string): string {
    return createHash("md5").update(s).digest("hex").toUpperCase();
  }

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
    await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await clean();
    process.env.PAYHERE_MERCHANT_ID = MERCHANT_ID;
    process.env.PAYHERE_MERCHANT_SECRET = MERCHANT_SECRET;

    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "webhook@x.lk",
        fullName: "Webhook Member",
        role: "member",
        status: "active",
      })
      .returning();
    memberId = m.id;
  });

  afterEach(clean);

  async function seedPending(reference: string) {
    await db.insert(payments).values({
      memberId,
      membershipId: null,
      planId,
      amountLkr: "1500.00",
      method: "payhere",
      kind: "membership",
      status: "pending",
      reference,
      recordedBy: memberId,
    });
  }

  function postForm(fields: Record<string, string>): Request {
    const body = new URLSearchParams(fields);
    return new Request("http://localhost/api/payments/payhere/webhook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  function signedPayload(opts: {
    reference: string;
    amount?: string;
    statusCode: "2" | "0" | "-1" | "-2" | "-3";
  }): Record<string, string> {
    const amount = opts.amount ?? "1500.00";
    const sig = md5Upper(
      MERCHANT_ID +
        opts.reference +
        amount +
        "LKR" +
        opts.statusCode +
        md5Upper(MERCHANT_SECRET),
    );
    return {
      merchant_id: MERCHANT_ID,
      order_id: opts.reference,
      payment_id: "PAY999",
      payhere_amount: amount,
      payhere_currency: "LKR",
      status_code: opts.statusCode,
      md5sig: sig,
    };
  }

  describe("POST /api/payments/payhere/webhook", () => {
    it("returns 401 on bad signature", async () => {
      const fields = signedPayload({
        reference: "gym_w1",
        statusCode: "2",
      });
      fields.md5sig = "0".repeat(32);
      const res = await POST(postForm(fields));
      expect(res.status).toBe(401);
    });

    it("returns 200 + flips the pending row on a verified success", async () => {
      const ref = "gym_w2";
      await seedPending(ref);
      const res = await POST(postForm(signedPayload({ reference: ref, statusCode: "2" })));
      expect(res.status).toBe(200);
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("succeeded");
      expect(row.membershipId).not.toBeNull();
    });

    it("returns 200 + flips to failed on status_code -2", async () => {
      const ref = "gym_w3";
      await seedPending(ref);
      const res = await POST(postForm(signedPayload({ reference: ref, statusCode: "-2" })));
      expect(res.status).toBe(200);
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, ref));
      expect(row.status).toBe("failed");
    });

    it("returns 200 on row_not_found (no DB write)", async () => {
      const res = await POST(
        postForm(signedPayload({ reference: "gym_w_unknown", statusCode: "2" })),
      );
      expect(res.status).toBe(200);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/payhere/webhook-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/payments/payhere/webhook/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { verifyWebhookSignature } from "@/lib/payhere/sign";
  import {
    _processWebhookUnsafe,
    type VerifiedWebhookPayload,
  } from "@/lib/payhere/process";
  import { todayInSL } from "@/lib/tz";

  export async function POST(req: Request) {
    const secret = process.env.PAYHERE_MERCHANT_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "PayHere not configured" },
        { status: 500 },
      );
    }

    let form: URLSearchParams;
    try {
      const text = await req.text();
      form = new URLSearchParams(text);
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const payload: Record<string, string> = {};
    for (const [k, v] of form.entries()) payload[k] = v;

    if (!verifyWebhookSignature(payload, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const result = await _processWebhookUnsafe({
      verified: payload as unknown as VerifiedWebhookPayload,
      todaySL: todayInSL(),
    });

    // Always 200 after signature verify — non-2xx triggers PayHere retries
    // and the outcome is informational, not failure.
    if (!result.ok) {
      console.warn(
        `[payhere webhook] order_id=${payload.order_id} reason=${result.reason}`,
      );
      return NextResponse.json({ ok: false, reason: result.reason });
    }
    return NextResponse.json({ ok: true, outcome: result.outcome });
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/payhere/webhook-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/payments/payhere/webhook/ tests/app/api/payhere/webhook-route.test.ts
  git commit -m "feat: PayHere webhook route (verify md5sig, flip row, stack membership)"
  ```

---

## Task 8: Route — `POST /api/cron/reconcile-payhere`

**Why:** Bearer-guarded endpoint that runs `_reconcilePendingUnsafe` with the real `fetchPayHereStatus`. CF cron-trigger scheduling waits for Phase 5 (when reminders + auto-inactivation crons also land); the endpoint can be curl-tested in dev now.

**Files:**
- Create: `src/app/api/cron/reconcile-payhere/route.ts`
- Create: `tests/app/api/payhere/reconcile-route.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/api/payhere/reconcile-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

  vi.mock("@/lib/payhere/api", () => ({
    fetchPayHereStatus: vi.fn(async () => ({ kind: "not_found" })),
  }));

  import { POST } from "@/app/api/cron/reconcile-payhere/route";

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.PAYHERE_MERCHANT_ID = "1230000";
    process.env.PAYHERE_MERCHANT_SECRET = "x";
    process.env.PAYHERE_MODE = "sandbox";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/cron/reconcile-payhere", () => {
    it("returns 401 without the bearer header", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/reconcile-payhere", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 on wrong bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/reconcile-payhere", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 + summary on correct bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/reconcile-payhere", {
          method: "POST",
          headers: { authorization: "Bearer test-cron-secret" },
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        processed: number;
        succeeded: number;
        failed: number;
        still_pending: number;
      };
      expect(typeof json.processed).toBe("number");
      expect(typeof json.succeeded).toBe("number");
      expect(typeof json.failed).toBe("number");
      expect(typeof json.still_pending).toBe("number");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/payhere/reconcile-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/cron/reconcile-payhere/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { _reconcilePendingUnsafe } from "@/lib/payhere/reconcile";
  import { fetchPayHereStatus } from "@/lib/payhere/api";
  import { todayInSL } from "@/lib/tz";

  export async function POST(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const mode = (process.env.PAYHERE_MODE ?? "sandbox") as "sandbox" | "live";
    if (!cronSecret || !merchantId || !merchantSecret) {
      return NextResponse.json(
        { error: "server misconfigured" },
        { status: 500 },
      );
    }

    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const summary = await _reconcilePendingUnsafe({
      fetchStatus: (ref) =>
        fetchPayHereStatus(ref, { merchantId, merchantSecret, mode }),
      todaySL: todayInSL(),
      merchantId,
      merchantSecret,
    });

    return NextResponse.json(summary);
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/payhere/reconcile-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/cron/reconcile-payhere/ tests/app/api/payhere/reconcile-route.test.ts
  git commit -m "feat: reconcile-payhere cron endpoint (bearer-guarded, schedule in Phase 5)"
  ```

---

## Task 9: `/portal/pay/confirm` page — polling confirmation

**Why:** After PayHere redirects the user back to us, we land on `/portal/pay/confirm?ref=gym_<uuid>` and poll the status endpoint every 2 seconds. Green when row is `succeeded`, red when `failed`, "still confirming" with a manual refresh hint after 30 seconds.

**Files:**
- Create: `src/app/portal/pay/confirm/page.tsx`
- Create: `src/app/portal/pay/confirm/_poll.tsx`

- [ ] **Step 1: Implement the server shell**

  Create `src/app/portal/pay/confirm/page.tsx`:

  ```tsx
  import { requireMemberProfile } from "@/lib/auth";
  import { db } from "@/db";
  import { payments } from "@/db/schema";
  import { and, eq } from "drizzle-orm";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Poll } from "./_poll";

  export default async function PayConfirmPage({
    searchParams,
  }: {
    searchParams: Promise<{ ref?: string }>;
  }) {
    const me = await requireMemberProfile();
    const { ref } = await searchParams;

    if (!ref) {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No payment to confirm</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Missing reference. Return to the portal home.
          </CardContent>
        </Card>
      );
    }

    const [row] = await db
      .select({
        memberId: payments.memberId,
        status: payments.status,
      })
      .from(payments)
      .where(
        and(eq(payments.reference, ref), eq(payments.method, "payhere")),
      )
      .limit(1);

    if (!row) {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Payment not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We can&apos;t find a payment with that reference. If you completed
            checkout, refresh in a minute.
          </CardContent>
        </Card>
      );
    }
    if (row.memberId !== me.id) {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Not your payment</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This payment belongs to a different member.
          </CardContent>
        </Card>
      );
    }

    return <Poll reference={ref} initialStatus={row.status} />;
  }
  ```

- [ ] **Step 2: Implement the client poller**

  Create `src/app/portal/pay/confirm/_poll.tsx`:

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

  type Status = "pending" | "succeeded" | "failed" | "refunded";

  export function Poll({
    reference,
    initialStatus,
  }: {
    reference: string;
    initialStatus: Status;
  }) {
    const [status, setStatus] = useState<Status>(initialStatus);
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
      if (status === "succeeded" || status === "failed" || status === "refunded") {
        return;
      }
      const started = Date.now();
      const id = setInterval(async () => {
        setElapsedMs(Date.now() - started);
        try {
          const res = await fetch(
            `/api/payments/payhere/status/${encodeURIComponent(reference)}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const json = (await res.json()) as { status: Status };
          setStatus(json.status);
          if (
            json.status === "succeeded" ||
            json.status === "failed" ||
            json.status === "refunded"
          ) {
            clearInterval(id);
          }
        } catch {
          // ignore; next tick will retry
        }
      }, 2000);
      return () => clearInterval(id);
    }, [reference, status]);

    if (status === "succeeded") {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Payment confirmed</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Your membership has been extended. You can close this tab.
          </CardContent>
        </Card>
      );
    }
    if (status === "failed") {
      return (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Payment failed</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            We didn&apos;t receive a successful payment. No charge has been
            recorded. Try again or visit the front desk.
          </CardContent>
        </Card>
      );
    }
    const stuck = elapsedMs > 30_000;
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Confirming your payment…</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Waiting for PayHere to notify us. This usually takes a few seconds.
          </p>
          {stuck && (
            <p>
              Still pending after 30s. Refresh this page in a minute; if the
              status doesn&apos;t change, the front desk can look it up.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 3: Build to make sure types are happy**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 4: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: all green (130 prior + ~25 new = ~155 passing).

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/portal/pay/confirm/
  git commit -m "feat: /portal/pay/confirm page polls payment status every 2s"
  ```

---

## Task 10: End-to-end walkthrough + Phase 4 tag

**Why:** Verify the full Phase 4 surface works against the real Supabase DB and PayHere sandbox, then tag the milestone.

- [ ] **Step 1: Confirm the full suite is green**

  ```powershell
  npm test
  ```

  Expected: ~155–160 tests passing across ~28–30 files.

- [ ] **Step 2: Production build (not deploying)**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 3: Start dev server + cloudflared tunnel**

  In one PowerShell window:

  ```powershell
  npm run dev
  ```

  In a second PowerShell window:

  ```powershell
  cloudflared tunnel --url http://localhost:3000
  ```

  Copy the `https://<random>.trycloudflare.com` URL it prints.

- [ ] **Step 4: Configure PayHere sandbox**

  In the PayHere sandbox merchant dashboard (https://sandbox.payhere.lk):
  - Settings → Domains & Credentials → add the cloudflared URL as an allowed domain.
  - Save merchant_id + merchant_secret into `.env.local`:

  ```
  PAYHERE_MERCHANT_ID=<from dashboard>
  PAYHERE_MERCHANT_SECRET=<from dashboard>
  PAYHERE_MODE=sandbox
  PAYHERE_NOTIFY_URL=https://<tunnel>.trycloudflare.com/api/payments/payhere/webhook
  APP_URL=https://<tunnel>.trycloudflare.com
  CRON_SECRET=<32-byte-hex>
  ```

  Restart `npm run dev` so the env vars take effect.

- [ ] **Step 5: Manual E2E — success path**

  1. Sign in as a member at `https://<tunnel>.trycloudflare.com/portal`.
  2. Find the member's UUID + a plan UUID (from `npm run db:studio` or admin members table).
  3. From the browser's devtools or `curl` with the Clerk session cookie:

     ```powershell
     curl.exe -X POST https://<tunnel>.trycloudflare.com/api/payments/payhere/checkout `
       -H "content-type: application/json" `
       -b "session=<clerk-session-cookie>" `
       -d "{`"planId`":`"<plan-uuid>`"}" `
       -o response.html
     ```

     Or in the browser console:

     ```js
     const r = await fetch('/api/payments/payhere/checkout', {
       method: 'POST',
       headers: {'content-type':'application/json'},
       body: JSON.stringify({planId: '<plan-uuid>'})
     });
     document.open(); document.write(await r.text()); document.close();
     ```

  4. PayHere sandbox checkout appears. Use card `4916217501611292`, exp `12/30`, CVV `123`. Submit.
  5. PayHere redirects to `/portal/pay/confirm?ref=gym_…`. Watch the page poll and turn green within a few seconds.
  6. Open `/portal` — confirm a new membership row is listed and the old one (if any) is still active, with the new one stacked.
  7. Open `/admin/members/<member-id>` — confirm a `succeeded` PayHere payment row appears in Payments and the new membership row appears in memberships.

- [ ] **Step 6: Manual E2E — failure path**

  1. Repeat steps 3–4 above with PayHere sandbox card `4929119799365646` (declines).
  2. PayHere redirects back; confirm page polls and turns red.
  3. Verify in DB: that row's `status='failed'`, no membership row created.

- [ ] **Step 7: Manual E2E — reconciliation**

  1. Repeat step 3 to create a pending row, but close the tab before PayHere sends the webhook (or kill the tunnel briefly).
  2. Use `db:studio` or SQL to manually set the row's `paid_at` to 2 hours ago: `update payments set paid_at = now() - interval '2 hours' where reference = 'gym_…';`
  3. Hit the reconcile endpoint:

     ```powershell
     curl.exe -X POST https://<tunnel>.trycloudflare.com/api/cron/reconcile-payhere `
       -H "authorization: Bearer <CRON_SECRET>"
     ```

  4. Inspect the JSON summary. If PayHere has the order, status flips. If not (>24h old), row flips to failed.

- [ ] **Step 8: Stop dev server + tunnel**

  Ctrl+C both PowerShell windows.

- [ ] **Step 9: Tag the milestone**

  ```powershell
  git tag phase-4
  ```

  Push only when the user gives the OK — Phase 3 isn't pushed yet either (per project memory; awaiting user authorization).

- [ ] **Step 10: Update project memory**

  Update `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` with a Phase 4 status block:
  - Tag `phase-4` at the green HEAD.
  - What's shipped: all 10 tasks, schema migration `0004_*`, ~25-30 new tests.
  - What's deferred: checkout UI surface, cron scheduling (Phase 5), PayHere refund API, receipt emails (Phase 5), live-mode flip.
  - Production deploy still pending (same OpenNext/CF gap that's been deferred since Phase 1).

---

## Self-Review

**Spec coverage:**

| Design section                                                | Covered by    |
| ------------------------------------------------------------- | ------------- |
| §2.1 checkout route                                           | Task 6        |
| §2.1 webhook route                                            | Task 7        |
| §2.1 status route                                             | Task 6        |
| §2.1 reconcile cron route (built, not scheduled)              | Task 8        |
| §2.2 `/portal/pay/confirm` polling page                       | Task 9        |
| §2.3 `payments.plan_id` column                                | Task 0        |
| §3 file layout (`src/lib/payhere/*` + routes + page)          | Tasks 1, 3–9  |
| §4.1 checkout data flow (pre-insert + auto-post HTML)         | Tasks 3, 6    |
| §4.2 webhook data flow (verify, lock, decide, stack, insert)  | Tasks 1, 4, 7 |
| §4.3 reconciliation data flow                                 | Tasks 5, 8    |
| §4.4 stacking math                                            | Task 2        |
| §4.5 refunds reuse Phase 2's `_refundPaymentUnsafe`           | N/A (no code change needed; documented in design §4.5) |
| §5 error handling (every row in the table)                    | Tests in Tasks 1, 3, 4, 5, 6, 7, 8 |
| §6 env vars                                                   | Conventions section above, Task 6+8 routes read them, Task 10 docs setup |
| §7.1 pure-logic tests                                         | Tasks 1, 2    |
| §7.2 DB integration tests                                     | Tasks 3, 4, 5 |
| §7.3 route-handler tests                                      | Tasks 6, 7, 8 |
| §7.4 local E2E walkthrough                                    | Task 10       |
| §8 done criteria (tests, build, E2E, tag)                     | Task 10       |
| §9 deferrals                                                  | Documented; explicitly not in tasks |

**Placeholder scan:** no "TBD", "TODO", or "similar to" — every step has runnable code or runnable commands.

**Type consistency:** `CheckoutInput`, `CheckoutFields` exported from `sign.ts` are imported and used in `checkout.ts` and the checkout route. `VerifiedWebhookPayload`, `ProcessResult`, `ProcessOutcome`, `ProcessReason` defined in `process.ts` are consumed by `reconcile.ts` and the webhook route. `PayHereStatus` defined in `api.ts` is the contract between the cron route, `reconcile.ts`, and tests. `NextWindowResult` from `next-window.ts` is used inside `process.ts`. All names verified consistent in task code blocks.

**One known fragility:** Task 4's `tx.execute(sql\`... for update\`)` row-access shape depends on the installed `drizzle-orm` version. The implementer should confirm via a single `console.log` during the first test run and adjust the `rows?.[0] ?? (rows as ...)[0]` line if needed. Called out inline in Task 4 Step 3.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time with review between each commit.*
