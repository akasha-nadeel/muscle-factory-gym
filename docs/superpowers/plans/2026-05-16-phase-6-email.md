# Phase 6 — Transactional Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four transactional emails — three reminders (3-day / 1-day pre-expiry + daily overdue) and a PayHere receipt — via a `Mailer` interface wrapping Resend, with React Email templates and a new daily cron at 07:00 SL wired through the Phase 5 dispatcher.

**Architecture:** Pure-logic `decideReminder` decides per-member which reminder (if any) to send. `_sendRemindersUnsafe` iterates active members, calls the decision function, renders a React Email template, sends via the injected `Mailer`, and stamps the row on success. `_processWebhookUnsafe` gains an optional `mailer` param and returns a `ReceiptContext` on success outcomes; the webhook route handler fires the receipt after the transaction commits. `Mailer` is the testing seam — `fakeMailer` captures sends in tests; `makeResendMailer()` is the production factory.

**Tech Stack:** Same as prior phases — Next.js 15 + Drizzle + Supabase + Clerk + CF Workers via OpenNext, Vitest 4. Two new runtime deps: `resend` and `@react-email/components` (the latter brings `@react-email/render` transitively).

**Reference design:** `docs/plans/2026-05-16-phase-6-email-design.md` (committed `c320447`).
**Reference Phase 4:** `docs/superpowers/plans/2026-05-16-phase-4-payhere.md` (especially Task 4 webhook processor + Task 5 reconcile helper with injected `fetchStatus`).
**Reference Phase 5:** `docs/superpowers/plans/2026-05-16-phase-5-cron-lifecycle.md` (especially Task 5 `scheduled()` dispatcher + Task 6 wrangler.jsonc wiring).

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell**.
- Every Task ends with one `git commit` (Task 0 has none — directory setup only).
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- DB-touching tests use `phase6_test_*` clerk-id prefixes and clean up before AND after each test.
- "Today" everywhere is the SL local date via `todayInSL()` from `src/lib/tz.ts`.
- `_*Unsafe` helpers do NOT call `requireAdminProfile()` / `requireMemberProfile()` — they're called directly from route handlers (and from tests).
- `vitest.config.ts` has `fileParallelism: false`. Do not change.

---

## Environment variables added

Add to `.env.local` before Task 5:

```
RESEND_API_KEY=re_dev_placeholder
EMAIL_FROM=onboarding@resend.dev
```

`onboarding@resend.dev` is Resend's sandbox sender — it works without a verified domain but only sends to your signup email. For production, sign up at resend.com, verify a domain, and flip `EMAIL_FROM=noreply@<your-domain>`.

Reused from prior phases: `CRON_SECRET`, `APP_URL`, `WORKER_HOSTNAME`.

---

## File structure (new and modified)

```
src/
  lib/
    email/
      mailer.ts                                  (NEW — Task 2: Mailer interface)
      resend-mailer.ts                           (NEW — Task 3: makeResendMailer())
      render.ts                                  (NEW — Task 4: renderEmail() wrapper)
      decide-reminder.ts                         (NEW — Task 1: pure decision tree)
      templates/
        reminder-3d.tsx                          (NEW — Task 4)
        reminder-1d.tsx                          (NEW — Task 4)
        reminder-overdue.tsx                     (NEW — Task 4)
        payhere-receipt.tsx                      (NEW — Task 4)
    cron/
      send-reminders.ts                          (NEW — Task 5: _sendRemindersUnsafe)
    payhere/
      process.ts                                 (MODIFY — Task 7: add optional mailer + sendCtx)
  app/
    api/
      cron/
        send-reminders/route.ts                  (NEW — Task 6: thin shell)
      payments/payhere/webhook/route.ts          (MODIFY — Task 7: build mailer + fire receipt)
  worker-with-scheduled.ts                       (MODIFY — Task 8: ROUTES adds new cron)

wrangler.jsonc                                   (MODIFY — Task 8: triggers.crons adds "30 1 * * *")

tests/
  lib/
    email-decide-reminder.test.ts                (NEW — Task 1, ~15 tests)
    email-templates.test.ts                      (NEW — Task 4, 4 tests)
    email-send-reminders.test.ts                 (NEW — Task 5, 5 tests)
    payhere-process-receipt.test.ts              (NEW — Task 7, 2 tests)
  app/api/
    cron-send-reminders-route.test.ts            (NEW — Task 6, 3 tests)
```

No schema migration; the `reminder_3d_sent_at` / `reminder_1d_sent_at` / `last_overdue_reminder_at` columns added in Phase 1 are sufficient.

---

## Task 0: Install deps + verify baseline + create dirs

**Why:** Two new packages (`resend`, `@react-email/components`) and pre-created directories. Baseline test count to compare against at the end.

**Files:** (no commits)

- [ ] **Step 1: Confirm baseline tests green**

  ```powershell
  npm test
  ```

  Expected: `Tests  192 passed (192)` across 39 files. If anything fails, stop.

- [ ] **Step 2: Install runtime deps**

  ```powershell
  npm install resend @react-email/components
  ```

  Expected: lockfile updates, no peer-dep warnings that block install. `@react-email/components` brings `@react-email/render` transitively, which is what `renderEmail()` will use.

- [ ] **Step 3: Confirm tests still green after install**

  ```powershell
  npm test
  ```

  Expected: still 192/192. (No code touches the new packages yet.)

- [ ] **Step 4: Create the new directories**

  ```powershell
  New-Item -ItemType Directory -Path src/lib/email -Force | Out-Null
  New-Item -ItemType Directory -Path src/lib/email/templates -Force | Out-Null
  New-Item -ItemType Directory -Path src/app/api/cron/send-reminders -Force | Out-Null
  ```

  If on bash:
  ```bash
  mkdir -p src/lib/email/templates src/app/api/cron/send-reminders
  ```

- [ ] **Step 5: Commit the dep install only**

  ```powershell
  git add package.json package-lock.json
  git commit -m "chore: add resend + @react-email/components for Phase 6"
  ```

---

## Task 1: `decideReminder` — pure decision tree

**Why:** Heart of the reminder system. Given a member + their latest membership + today's SL date, returns which reminder (if any) to send. Pure function, no DB, no I/O. ~15 branches.

**Files:**
- Create: `src/lib/email/decide-reminder.ts`
- Create: `tests/lib/email-decide-reminder.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/email-decide-reminder.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import {
    decideReminder,
    type DecideMember,
    type DecideMembership,
  } from "@/lib/email/decide-reminder";

  const baseMember: DecideMember = { status: "active", role: "member" };

  function membership(
    overrides: Partial<DecideMembership>,
  ): DecideMembership {
    return {
      status: "active",
      endDate: "2026-05-19",
      reminder3dSentAt: null,
      reminder1dSentAt: null,
      lastOverdueReminderAt: null,
      ...overrides,
    };
  }

  describe("decideReminder", () => {
    it("returns null for an inactive member", () => {
      const r = decideReminder(
        { ...baseMember, status: "inactive" },
        membership({}),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns null for a pending member", () => {
      const r = decideReminder(
        { ...baseMember, status: "pending" },
        membership({}),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns null for an admin role", () => {
      const r = decideReminder(
        { status: "active", role: "admin" },
        membership({}),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns null when member has no memberships", () => {
      const r = decideReminder(baseMember, null, "2026-05-16");
      expect(r.kind).toBeNull();
    });

    it("returns null when membership is 5 days away (too early)", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-21" }),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns '3d' when active membership ends in 3 days and 3d stamp is null", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-19" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("3d");
    });

    it("returns '3d' when active membership ends in 2 days and 3d stamp is null (catch-up)", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-18" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("3d");
    });

    it("returns null when 3d stamp is already set and 3 days remain", () => {
      const r = decideReminder(
        baseMember,
        membership({
          endDate: "2026-05-19",
          reminder3dSentAt: new Date("2026-05-15T07:00:00Z"),
        }),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns '1d' when active membership ends in 1 day and 1d stamp is null", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-17" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("1d");
    });

    it("returns null when 1d stamp is already set and 1 day remains", () => {
      const r = decideReminder(
        baseMember,
        membership({
          endDate: "2026-05-17",
          reminder1dSentAt: new Date("2026-05-16T07:00:00Z"),
        }),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns '1d' (priority over 3d) when 1 day remains and both stamps null", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-17" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("1d");
    });

    it("returns '1d' (defensive) when endDate === today and 1d stamp null", () => {
      const r = decideReminder(
        baseMember,
        membership({ endDate: "2026-05-16" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("1d");
    });

    it("returns 'overdue' when membership is expired and last_overdue stamp is null", () => {
      const r = decideReminder(
        baseMember,
        membership({ status: "expired", endDate: "2026-05-10" }),
        "2026-05-16",
      );
      expect(r.kind).toBe("overdue");
    });

    it("returns 'overdue' when last_overdue stamp is from a prior day", () => {
      const r = decideReminder(
        baseMember,
        membership({
          status: "expired",
          endDate: "2026-05-10",
          lastOverdueReminderAt: new Date("2026-05-15T07:00:00Z"),
        }),
        "2026-05-16",
      );
      expect(r.kind).toBe("overdue");
    });

    it("returns null when last_overdue stamp is from today", () => {
      const r = decideReminder(
        baseMember,
        membership({
          status: "expired",
          endDate: "2026-05-10",
          lastOverdueReminderAt: new Date("2026-05-16T03:00:00Z"),
        }),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });

    it("returns null for a cancelled membership", () => {
      const r = decideReminder(
        baseMember,
        membership({ status: "cancelled", endDate: "2026-05-10" }),
        "2026-05-16",
      );
      expect(r.kind).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/lib/email-decide-reminder.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/email/decide-reminder.ts`:

  ```ts
  import { differenceInCalendarDays, parseISO, format } from "date-fns";

  export type ReminderKind = "3d" | "1d" | "overdue";

  export type DecideMember = {
    status: "active" | "pending" | "inactive";
    role: "admin" | "member";
  };

  export type DecideMembership = {
    status: "active" | "expired" | "cancelled";
    endDate: string; // YYYY-MM-DD
    reminder3dSentAt: Date | null;
    reminder1dSentAt: Date | null;
    lastOverdueReminderAt: Date | null;
  };

  export type DecideResult =
    | { kind: ReminderKind }
    | { kind: null; reason: string };

  /**
   * Decide which reminder (if any) to send for a member.
   *
   * Priority order:
   *  - member inactive/pending or admin → null
   *  - no memberships → null
   *  - cancelled membership → null
   *  - active membership, 1 day remaining (or 0 = endDate today, defensive),
   *    1d stamp null → '1d'  (priority over 3d when in overlap)
   *  - active membership, 2-3 days remaining, 3d stamp null → '3d'
   *  - expired membership, no overdue stamp today → 'overdue'
   *  - otherwise → null
   */
  export function decideReminder(
    member: DecideMember,
    latestMembership: DecideMembership | null,
    todaySL: string,
  ): DecideResult {
    if (member.status !== "active" || member.role !== "member") {
      return { kind: null, reason: "member_not_active" };
    }
    if (latestMembership === null) {
      return { kind: null, reason: "no_membership" };
    }
    if (latestMembership.status === "cancelled") {
      return { kind: null, reason: "cancelled" };
    }

    const today = parseISO(todaySL);
    const end = parseISO(latestMembership.endDate);
    const daysRemaining = differenceInCalendarDays(end, today);

    if (latestMembership.status === "active") {
      // 1d priority (covers daysRemaining = 0 and 1)
      if (daysRemaining <= 1 && daysRemaining >= 0) {
        if (latestMembership.reminder1dSentAt === null) {
          return { kind: "1d" };
        }
        return { kind: null, reason: "1d_already_sent" };
      }
      // 3d window covers 2-3 days for catch-up
      if (daysRemaining >= 2 && daysRemaining <= 3) {
        if (latestMembership.reminder3dSentAt === null) {
          return { kind: "3d" };
        }
        return { kind: null, reason: "3d_already_sent" };
      }
      return { kind: null, reason: "too_early" };
    }

    if (latestMembership.status === "expired") {
      const stamp = latestMembership.lastOverdueReminderAt;
      if (stamp === null) return { kind: "overdue" };
      const stampDay = format(stamp, "yyyy-MM-dd");
      if (stampDay < todaySL) return { kind: "overdue" };
      return { kind: null, reason: "overdue_already_sent_today" };
    }

    return { kind: null, reason: "unhandled" };
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/email-decide-reminder.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/email/decide-reminder.ts tests/lib/email-decide-reminder.test.ts
  git commit -m "feat: decideReminder pure decision tree (3d/1d/overdue/null)"
  ```

---

## Task 2: `Mailer` interface

**Why:** Pure interface file. No deps. Imported by tests as the contract for the fake mailer.

**Files:**
- Create: `src/lib/email/mailer.ts`

- [ ] **Step 1: Implement**

  Create `src/lib/email/mailer.ts`:

  ```ts
  export type SendOpts = {
    to: string;
    subject: string;
    html: string;
  };

  export type SendResult =
    | { ok: true; id?: string }
    | { ok: false; error: string };

  export type Mailer = {
    send(opts: SendOpts): Promise<SendResult>;
  };
  ```

  No tests yet — this file is a type-only contract. Subsequent tasks (Task 4, 5, 7) exercise it.

- [ ] **Step 2: Verify the build accepts it**

  ```powershell
  npm run build
  ```

  Expected: success (no test changes; just confirms the file is valid TS).

- [ ] **Step 3: Commit**

  ```powershell
  git add src/lib/email/mailer.ts
  git commit -m "feat: Mailer interface for email send abstraction"
  ```

---

## Task 3: `makeResendMailer()` factory

**Why:** Production implementation. Wraps the Resend SDK. Factory function (not const) so `process.env` reads happen at call time — lets tests omit `RESEND_API_KEY` without crashing module load.

**Files:**
- Create: `src/lib/email/resend-mailer.ts`

- [ ] **Step 1: Implement**

  Create `src/lib/email/resend-mailer.ts`:

  ```ts
  import { Resend } from "resend";
  import type { Mailer } from "./mailer";

  /**
   * Builds a Mailer backed by the Resend SDK. Reads RESEND_API_KEY and
   * EMAIL_FROM from the environment at call time.
   *
   * Throws if either env var is missing — callers should construct this
   * lazily (e.g. inside a request handler) so test-time imports don't
   * crash on cold module load.
   */
  export function makeResendMailer(): Mailer {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required");
    }
    const client = new Resend(apiKey);
    return {
      async send(opts) {
        try {
          const r = await client.emails.send({
            from,
            to: opts.to,
            subject: opts.subject,
            html: opts.html,
          });
          if (r.error) {
            return { ok: false, error: r.error.message };
          }
          return { ok: true, id: r.data?.id };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  }
  ```

- [ ] **Step 2: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success. The `resend` package was installed in Task 0.

- [ ] **Step 3: Commit**

  ```powershell
  git add src/lib/email/resend-mailer.ts
  git commit -m "feat: makeResendMailer() factory wraps Resend SDK"
  ```

---

## Task 4: React Email templates + `renderEmail()` helper

**Why:** Four templates (3d / 1d / overdue / receipt) + one rendering helper. Templates are TSX components; `renderEmail()` converts them to inline-styled HTML strings via `@react-email/render`.

**Files:**
- Create: `src/lib/email/render.ts`
- Create: `src/lib/email/templates/reminder-3d.tsx`
- Create: `src/lib/email/templates/reminder-1d.tsx`
- Create: `src/lib/email/templates/reminder-overdue.tsx`
- Create: `src/lib/email/templates/payhere-receipt.tsx`
- Create: `tests/lib/email-templates.test.ts`

- [ ] **Step 1: Implement the render helper**

  Create `src/lib/email/render.ts`:

  ```ts
  import { render } from "@react-email/render";
  import type { ReactElement } from "react";

  /**
   * Renders a React Email component to an HTML string suitable for the
   * `html` field of a Resend send. Uses inline styles via @react-email/render.
   */
  export async function renderEmail(component: ReactElement): Promise<string> {
    return await render(component);
  }
  ```

- [ ] **Step 2: Implement the 3-day reminder template**

  Create `src/lib/email/templates/reminder-3d.tsx`:

  ```tsx
  import {
    Html,
    Body,
    Container,
    Heading,
    Text,
    Button,
    Section,
  } from "@react-email/components";

  export function Reminder3dEmail(props: {
    memberName: string;
    planName: string;
    endDate: string;
    appUrl: string;
  }) {
    return (
      <Html>
        <Body
          style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
        >
          <Container
            style={{
              backgroundColor: "#ffffff",
              padding: "32px",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
              Your membership ends in 3 days
            </Heading>
            <Text>Hi {props.memberName},</Text>
            <Text>
              Your <strong>{props.planName}</strong> membership ends on{" "}
              <strong>{props.endDate}</strong>. Renew at the front desk or pay
              online to keep training without interruption.
            </Text>
            <Section style={{ marginTop: "24px" }}>
              <Button
                href={`${props.appUrl}/portal`}
                style={{
                  backgroundColor: "#000",
                  color: "#fff",
                  padding: "12px 20px",
                  textDecoration: "none",
                  borderRadius: "6px",
                }}
              >
                Open member portal
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    );
  }
  ```

- [ ] **Step 3: Implement the 1-day reminder template**

  Create `src/lib/email/templates/reminder-1d.tsx`:

  ```tsx
  import {
    Html,
    Body,
    Container,
    Heading,
    Text,
    Button,
    Section,
  } from "@react-email/components";

  export function Reminder1dEmail(props: {
    memberName: string;
    planName: string;
    endDate: string;
    appUrl: string;
  }) {
    return (
      <Html>
        <Body
          style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
        >
          <Container
            style={{
              backgroundColor: "#ffffff",
              padding: "32px",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
              Your membership ends tomorrow
            </Heading>
            <Text>Hi {props.memberName},</Text>
            <Text>
              Your <strong>{props.planName}</strong> membership ends on{" "}
              <strong>{props.endDate}</strong>. Renew today to avoid an
              interruption.
            </Text>
            <Section style={{ marginTop: "24px" }}>
              <Button
                href={`${props.appUrl}/portal`}
                style={{
                  backgroundColor: "#000",
                  color: "#fff",
                  padding: "12px 20px",
                  textDecoration: "none",
                  borderRadius: "6px",
                }}
              >
                Open member portal
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    );
  }
  ```

- [ ] **Step 4: Implement the overdue reminder template**

  Create `src/lib/email/templates/reminder-overdue.tsx`:

  ```tsx
  import {
    Html,
    Body,
    Container,
    Heading,
    Text,
    Button,
    Section,
  } from "@react-email/components";

  export function ReminderOverdueEmail(props: {
    memberName: string;
    planName: string;
    endDate: string;
    appUrl: string;
  }) {
    return (
      <Html>
        <Body
          style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
        >
          <Container
            style={{
              backgroundColor: "#ffffff",
              padding: "32px",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
              Your membership has expired
            </Heading>
            <Text>Hi {props.memberName},</Text>
            <Text>
              Your <strong>{props.planName}</strong> membership expired on{" "}
              <strong>{props.endDate}</strong>. Renew anytime to resume your
              workouts.
            </Text>
            <Section style={{ marginTop: "24px" }}>
              <Button
                href={`${props.appUrl}/portal`}
                style={{
                  backgroundColor: "#000",
                  color: "#fff",
                  padding: "12px 20px",
                  textDecoration: "none",
                  borderRadius: "6px",
                }}
              >
                Renew now
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    );
  }
  ```

- [ ] **Step 5: Implement the PayHere receipt template**

  Create `src/lib/email/templates/payhere-receipt.tsx`:

  ```tsx
  import {
    Html,
    Body,
    Container,
    Heading,
    Text,
    Hr,
  } from "@react-email/components";

  export function PayhereReceiptEmail(props: {
    memberName: string;
    planName: string;
    amountLkr: string;
    newMembershipStart: string;
    newMembershipEnd: string;
  }) {
    return (
      <Html>
        <Body
          style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
        >
          <Container
            style={{
              backgroundColor: "#ffffff",
              padding: "32px",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
              Payment received
            </Heading>
            <Text>Hi {props.memberName},</Text>
            <Text>
              We've received your payment of{" "}
              <strong>LKR {props.amountLkr}</strong> for the{" "}
              <strong>{props.planName}</strong> plan.
            </Text>
            <Hr style={{ margin: "20px 0" }} />
            <Text>
              <strong>Membership period:</strong>
              <br />
              {props.newMembershipStart} to {props.newMembershipEnd}
            </Text>
            <Text style={{ marginTop: "24px", color: "#666", fontSize: "13px" }}>
              Keep this email as your receipt.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }
  ```

- [ ] **Step 6: Write template smoke tests**

  Create `tests/lib/email-templates.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { renderEmail } from "@/lib/email/render";
  import { Reminder3dEmail } from "@/lib/email/templates/reminder-3d";
  import { Reminder1dEmail } from "@/lib/email/templates/reminder-1d";
  import { ReminderOverdueEmail } from "@/lib/email/templates/reminder-overdue";
  import { PayhereReceiptEmail } from "@/lib/email/templates/payhere-receipt";

  describe("email templates render", () => {
    it("Reminder3dEmail produces HTML with member name, plan, and CTA", async () => {
      const html = await renderEmail(
        <Reminder3dEmail
          memberName="John Silva"
          planName="Monthly"
          endDate="2026-06-01"
          appUrl="https://gym.example"
        />,
      );
      expect(html).toContain("John Silva");
      expect(html).toContain("Monthly");
      expect(html).toContain("2026-06-01");
      expect(html).toContain("https://gym.example/portal");
    });

    it("Reminder1dEmail produces HTML with member name, plan, and CTA", async () => {
      const html = await renderEmail(
        <Reminder1dEmail
          memberName="Jane Perera"
          planName="Annual"
          endDate="2026-12-31"
          appUrl="https://gym.example"
        />,
      );
      expect(html).toContain("Jane Perera");
      expect(html).toContain("Annual");
      expect(html).toContain("2026-12-31");
      expect(html).toContain("https://gym.example/portal");
    });

    it("ReminderOverdueEmail produces HTML with member name and renew CTA", async () => {
      const html = await renderEmail(
        <ReminderOverdueEmail
          memberName="Akila Bandara"
          planName="Monthly"
          endDate="2026-04-15"
          appUrl="https://gym.example"
        />,
      );
      expect(html).toContain("Akila Bandara");
      expect(html).toContain("Monthly");
      expect(html).toContain("expired");
      expect(html).toContain("https://gym.example/portal");
    });

    it("PayhereReceiptEmail produces HTML with amount, plan, and membership window", async () => {
      const html = await renderEmail(
        <PayhereReceiptEmail
          memberName="Nimal Fernando"
          planName="Monthly"
          amountLkr="3000.00"
          newMembershipStart="2026-06-02"
          newMembershipEnd="2026-07-01"
        />,
      );
      expect(html).toContain("Nimal Fernando");
      expect(html).toContain("Monthly");
      expect(html).toContain("3000.00");
      expect(html).toContain("2026-06-02");
      expect(html).toContain("2026-07-01");
    });
  });
  ```

- [ ] **Step 7: Run — expect pass**

  ```powershell
  npm test -- tests/lib/email-templates.test.ts
  ```

  All 4 tests should pass. If `renderEmail` throws on import, the package may need a different entry — check that `@react-email/components` is installed and exports `Html`, `Body`, etc.

- [ ] **Step 8: Commit**

  ```powershell
  git add src/lib/email/render.ts src/lib/email/templates/ tests/lib/email-templates.test.ts
  git commit -m "feat: React Email templates (3d/1d/overdue reminders + PayHere receipt)"
  ```

---

## Task 5: `_sendRemindersUnsafe` — the reminder cron's workhorse

**Why:** Iterates every active member, runs `decideReminder` on their latest membership, renders the matching template, calls `mailer.send`, stamps on success. Send-then-stamp: failed sends don't stamp, tomorrow retries.

**Files:**
- Create: `src/lib/cron/send-reminders.ts`
- Create: `tests/lib/email-send-reminders.test.ts`

- [ ] **Step 1: Write the failing integration test**

  Create `tests/lib/email-send-reminders.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _sendRemindersUnsafe } from "@/lib/cron/send-reminders";
  import type { Mailer, SendOpts, SendResult } from "@/lib/email/mailer";

  const CLERK_PREFIX = "user_phase6_test_reminders_";
  const PLAN_NAME = "Phase6ReminderPlan";

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

  let planId: string;

  beforeEach(async () => {
    await clean();
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    planId = pl.id;
  });

  afterEach(clean);

  type RecordedSend = SendOpts;

  function makeFakeMailer(
    response: SendResult | ((opts: SendOpts) => SendResult) = { ok: true },
  ): { mailer: Mailer; sent: RecordedSend[] } {
    const sent: RecordedSend[] = [];
    const mailer: Mailer = {
      async send(opts) {
        sent.push(opts);
        return typeof response === "function" ? response(opts) : response;
      },
    };
    return { mailer, sent };
  }

  async function insertMember(suffix: string, status: "active" | "pending" | "inactive" = "active") {
    const [row] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}${suffix}`,
        email: `${suffix}@x.lk`,
        fullName: `Reminder ${suffix}`,
        role: "member",
        status,
      })
      .returning();
    return row;
  }

  async function insertMembership(
    memberId: string,
    opts: {
      status: "active" | "expired" | "cancelled";
      startDate: string;
      endDate: string;
    },
  ) {
    const [row] = await db
      .insert(memberships)
      .values({
        memberId,
        planId,
        startDate: opts.startDate,
        endDate: opts.endDate,
        status: opts.status,
      })
      .returning();
    return row;
  }

  describe("_sendRemindersUnsafe", () => {
    it("sends 3 different reminders to 3 members in their respective windows", async () => {
      const m3d = await insertMember("threeday");
      const m1d = await insertMember("oneday");
      const mover = await insertMember("overdue");
      await insertMembership(m3d.id, {
        status: "active",
        startDate: "2026-04-20",
        endDate: "2026-05-19", // 3 days from today=2026-05-16
      });
      await insertMembership(m1d.id, {
        status: "active",
        startDate: "2026-04-18",
        endDate: "2026-05-17", // 1 day from today
      });
      await insertMembership(mover.id, {
        status: "expired",
        startDate: "2026-04-01",
        endDate: "2026-05-10", // expired
      });

      const { mailer, sent } = makeFakeMailer({ ok: true });
      const summary = await _sendRemindersUnsafe({
        mailer,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });

      expect(summary.sent_3d).toBe(1);
      expect(summary.sent_1d).toBe(1);
      expect(summary.sent_overdue).toBe(1);
      expect(summary.failed).toBe(0);
      expect(sent.length).toBe(3);

      // Stamps should be set
      const memberships3d = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, m3d.id));
      expect(memberships3d[0].reminder3dSentAt).not.toBeNull();
      const memberships1d = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, m1d.id));
      expect(memberships1d[0].reminder1dSentAt).not.toBeNull();
      const membershipsOver = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, mover.id));
      expect(membershipsOver[0].lastOverdueReminderAt).not.toBeNull();
    });

    it("does not stamp when the mailer returns failure", async () => {
      const m = await insertMember("failsend");
      await insertMembership(m.id, {
        status: "active",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
      });
      const { mailer, sent } = makeFakeMailer({
        ok: false,
        error: "Resend rate limit",
      });
      const summary = await _sendRemindersUnsafe({
        mailer,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });

      expect(summary.failed).toBe(1);
      expect(summary.sent_3d).toBe(0);
      expect(sent.length).toBe(1);

      const [row] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.memberId, m.id));
      expect(row.reminder3dSentAt).toBeNull(); // not stamped
    });

    it("is idempotent on re-run (stamps prevent re-fire)", async () => {
      const m = await insertMember("idemp");
      await insertMembership(m.id, {
        status: "active",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
      });

      const { mailer: m1, sent: s1 } = makeFakeMailer({ ok: true });
      await _sendRemindersUnsafe({
        mailer: m1,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });
      expect(s1.length).toBe(1);

      const { mailer: m2, sent: s2 } = makeFakeMailer({ ok: true });
      const summary2 = await _sendRemindersUnsafe({
        mailer: m2,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });
      expect(s2.length).toBe(0);
      expect(summary2.sent_3d).toBe(0);
    });

    it("skips inactive members", async () => {
      const m = await insertMember("inactive", "inactive");
      await insertMembership(m.id, {
        status: "active",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
      });

      const { mailer, sent } = makeFakeMailer({ ok: true });
      await _sendRemindersUnsafe({
        mailer,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });

      expect(sent.length).toBe(0);
    });

    it("evaluates all active members and skips those not in a window", async () => {
      const eligible = await insertMember("eligible");
      await insertMembership(eligible.id, {
        status: "active",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
      });
      const tooEarly = await insertMember("toofar");
      await insertMembership(tooEarly.id, {
        status: "active",
        startDate: "2026-05-01",
        endDate: "2026-06-30",
      });
      const noMembership = await insertMember("nomembership");

      const { mailer, sent } = makeFakeMailer({ ok: true });
      const summary = await _sendRemindersUnsafe({
        mailer,
        todaySL: "2026-05-16",
        appUrl: "https://gym.example",
      });

      expect(summary.evaluated).toBeGreaterThanOrEqual(3);
      expect(summary.sent_3d).toBe(1);
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe("eligible@x.lk");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/email-send-reminders.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/lib/cron/send-reminders.ts`:

  ```ts
  import { db } from "@/db";
  import { profiles, memberships } from "@/db/schema";
  import { and, eq, desc, sql } from "drizzle-orm";
  import type { Mailer } from "@/lib/email/mailer";
  import { renderEmail } from "@/lib/email/render";
  import {
    decideReminder,
    type DecideMember,
    type DecideMembership,
    type ReminderKind,
  } from "@/lib/email/decide-reminder";
  import { Reminder3dEmail } from "@/lib/email/templates/reminder-3d";
  import { Reminder1dEmail } from "@/lib/email/templates/reminder-1d";
  import { ReminderOverdueEmail } from "@/lib/email/templates/reminder-overdue";
  import { plans } from "@/db/schema";

  export type ReminderSummary = {
    evaluated: number;
    sent_3d: number;
    sent_1d: number;
    sent_overdue: number;
    skipped: number;
    failed: number;
  };

  function stampColumnFor(kind: ReminderKind) {
    switch (kind) {
      case "3d":
        return memberships.reminder3dSentAt;
      case "1d":
        return memberships.reminder1dSentAt;
      case "overdue":
        return memberships.lastOverdueReminderAt;
    }
  }

  function subjectFor(kind: ReminderKind): string {
    switch (kind) {
      case "3d":
        return "Your gym membership ends in 3 days";
      case "1d":
        return "Your gym membership ends tomorrow";
      case "overdue":
        return "Your gym membership has expired";
    }
  }

  function templateFor(
    kind: ReminderKind,
    props: {
      memberName: string;
      planName: string;
      endDate: string;
      appUrl: string;
    },
  ) {
    switch (kind) {
      case "3d":
        return <Reminder3dEmail {...props} />;
      case "1d":
        return <Reminder1dEmail {...props} />;
      case "overdue":
        return <ReminderOverdueEmail {...props} />;
    }
  }

  export async function _sendRemindersUnsafe(input: {
    mailer: Mailer;
    todaySL: string;
    appUrl: string;
  }): Promise<ReminderSummary> {
    const summary: ReminderSummary = {
      evaluated: 0,
      sent_3d: 0,
      sent_1d: 0,
      sent_overdue: 0,
      skipped: 0,
      failed: 0,
    };

    // Pull every active member's latest membership (by end_date desc) along
    // with the plan name. LEFT JOIN so members with zero memberships still
    // appear (they get skipped by decideReminder).
    const rows = await db.execute(sql`
      SELECT
        p.id            AS member_id,
        p.email         AS member_email,
        p.full_name     AS member_name,
        p.status        AS member_status,
        p.role          AS member_role,
        m.id            AS membership_id,
        m.status        AS membership_status,
        m.end_date      AS membership_end_date,
        m.reminder_3d_sent_at,
        m.reminder_1d_sent_at,
        m.last_overdue_reminder_at,
        pl.name         AS plan_name
      FROM profiles p
      LEFT JOIN LATERAL (
        SELECT * FROM memberships
        WHERE member_id = p.id
        ORDER BY end_date DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN plans pl ON pl.id = m.plan_id
      WHERE p.status = 'active' AND p.role = 'member'
    `);

    // postgres-js returns rows as either an array directly or wrapped in
    // { rows: [] }. Handle both shapes (same pattern as Phase 5).
    const list =
      (rows as unknown as { rows?: unknown[] }).rows ??
      (rows as unknown as unknown[]);

    if (!Array.isArray(list)) return summary;

    for (const raw of list) {
      const r = raw as {
        member_id: string;
        member_email: string;
        member_name: string;
        member_status: "active" | "pending" | "inactive";
        member_role: "admin" | "member";
        membership_id: string | null;
        membership_status: "active" | "expired" | "cancelled" | null;
        membership_end_date: string | null;
        reminder_3d_sent_at: Date | null;
        reminder_1d_sent_at: Date | null;
        last_overdue_reminder_at: Date | null;
        plan_name: string | null;
      };
      summary.evaluated++;

      const member: DecideMember = {
        status: r.member_status,
        role: r.member_role,
      };
      const latest: DecideMembership | null =
        r.membership_id && r.membership_status && r.membership_end_date
          ? {
              status: r.membership_status,
              endDate: r.membership_end_date,
              reminder3dSentAt: r.reminder_3d_sent_at,
              reminder1dSentAt: r.reminder_1d_sent_at,
              lastOverdueReminderAt: r.last_overdue_reminder_at,
            }
          : null;

      const decision = decideReminder(member, latest, input.todaySL);
      if (decision.kind === null) {
        summary.skipped++;
        continue;
      }

      if (!r.member_email) {
        summary.failed++;
        console.warn(`[reminders] member ${r.member_id} has no email`);
        continue;
      }

      const html = await renderEmail(
        templateFor(decision.kind, {
          memberName: r.member_name,
          planName: r.plan_name ?? "your plan",
          endDate: r.membership_end_date ?? "",
          appUrl: input.appUrl,
        }),
      );

      const result = await input.mailer.send({
        to: r.member_email,
        subject: subjectFor(decision.kind),
        html,
      });

      if (!result.ok) {
        console.warn(
          `[reminders] ${r.member_email} ${decision.kind} send failed: ${result.error}`,
        );
        summary.failed++;
        continue;
      }

      // Send-then-stamp: only stamp when Resend confirmed.
      const stampCol = stampColumnFor(decision.kind);
      if (r.membership_id) {
        await db
          .update(memberships)
          .set({ [stampCol.name]: new Date() } as Record<string, Date>)
          .where(eq(memberships.id, r.membership_id));
      }

      if (decision.kind === "3d") summary.sent_3d++;
      else if (decision.kind === "1d") summary.sent_1d++;
      else if (decision.kind === "overdue") summary.sent_overdue++;
    }

    return summary;
  }
  ```

  **Note on the dynamic stamp update:** the `[stampCol.name]: new Date()` cast is needed because Drizzle's `.set()` is typed against the table's column object. The `as Record<string, Date>` keeps TypeScript happy. If you hit a runtime error on the UPDATE (e.g. "column does not exist"), `stampCol.name` may not match the SQL column — log it once to confirm; expected values are `'reminder_3d_sent_at'`, `'reminder_1d_sent_at'`, `'last_overdue_reminder_at'`.

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/lib/email-send-reminders.test.ts
  ```

  If the dynamic stamp update fails, replace the `.set({ [stampCol.name]: ... })` block with an explicit switch:

  ```ts
  if (decision.kind === "3d") {
    await db.update(memberships).set({ reminder3dSentAt: new Date() }).where(eq(memberships.id, r.membership_id));
  } else if (decision.kind === "1d") {
    await db.update(memberships).set({ reminder1dSentAt: new Date() }).where(eq(memberships.id, r.membership_id));
  } else if (decision.kind === "overdue") {
    await db.update(memberships).set({ lastOverdueReminderAt: new Date() }).where(eq(memberships.id, r.membership_id));
  }
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/lib/cron/send-reminders.ts tests/lib/email-send-reminders.test.ts
  git commit -m "feat: _sendRemindersUnsafe sends 3d/1d/overdue reminders + stamps on success"
  ```

---

## Task 6: `POST /api/cron/send-reminders` route

**Why:** Bearer-guarded thin shell. Builds the real `makeResendMailer()`, calls `_sendRemindersUnsafe`, returns the summary as JSON. Mirrors Phase 5's expire-memberships and inactivate-stale-members routes.

**Files:**
- Create: `src/app/api/cron/send-reminders/route.ts`
- Create: `tests/app/api/cron-send-reminders-route.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/app/api/cron-send-reminders-route.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import type { Mailer, SendOpts } from "@/lib/email/mailer";

  // Mock makeResendMailer so the route uses our fake instead of trying to
  // import the Resend SDK with no API key.
  const sent: SendOpts[] = [];
  vi.mock("@/lib/email/resend-mailer", () => ({
    makeResendMailer: (): Mailer => ({
      async send(opts) {
        sent.push(opts);
        return { ok: true };
      },
    }),
  }));

  import { POST } from "@/app/api/cron/send-reminders/route";

  beforeEach(() => {
    sent.length = 0;
    process.env.CRON_SECRET = "phase6-reminders-route-secret";
    process.env.APP_URL = "https://gym.example";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/cron/send-reminders", () => {
    it("returns 401 without the bearer header", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/send-reminders", {
          method: "POST",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 on wrong bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/send-reminders", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 200 + summary JSON on correct bearer", async () => {
      const res = await POST(
        new Request("http://localhost/api/cron/send-reminders", {
          method: "POST",
          headers: { authorization: "Bearer phase6-reminders-route-secret" },
        }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        evaluated: number;
        sent_3d: number;
        sent_1d: number;
        sent_overdue: number;
        skipped: number;
        failed: number;
      };
      expect(typeof json.evaluated).toBe("number");
      expect(typeof json.sent_3d).toBe("number");
      expect(typeof json.sent_1d).toBe("number");
      expect(typeof json.sent_overdue).toBe("number");
      expect(typeof json.skipped).toBe("number");
      expect(typeof json.failed).toBe("number");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/app/api/cron-send-reminders-route.test.ts
  ```

- [ ] **Step 3: Implement**

  Create `src/app/api/cron/send-reminders/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { _sendRemindersUnsafe } from "@/lib/cron/send-reminders";
  import { makeResendMailer } from "@/lib/email/resend-mailer";
  import { todayInSL } from "@/lib/tz";

  export async function POST(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
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

    let mailer;
    try {
      mailer = makeResendMailer();
    } catch (err) {
      console.warn(
        `[reminders route] makeResendMailer failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return NextResponse.json(
        { error: "mailer not configured" },
        { status: 500 },
      );
    }

    const summary = await _sendRemindersUnsafe({
      mailer,
      todaySL: todayInSL(),
      appUrl,
    });
    return NextResponse.json(summary);
  }
  ```

- [ ] **Step 4: Run — expect pass**

  ```powershell
  npm test -- tests/app/api/cron-send-reminders-route.test.ts
  ```

- [ ] **Step 5: Commit**

  ```powershell
  git add src/app/api/cron/send-reminders/ tests/app/api/cron-send-reminders-route.test.ts
  git commit -m "feat: /api/cron/send-reminders endpoint (bearer-guarded)"
  ```

---

## Task 7: Wire PayHere receipt — modify `_processWebhookUnsafe` + webhook route

**Why:** The webhook gains one additive change. `_processWebhookUnsafe` returns a `sendCtx` on the FIRST `succeeded` outcome; the route handler fires the receipt after the transaction commits. Duplicate webhook deliveries (`outcome: 'already_processed'`) return no `sendCtx`, so no duplicate emails. Helper signature backwards-compatible — the existing 10 Phase 4 webhook tests don't pass a mailer and still pass.

**Files:**
- Modify: `src/lib/payhere/process.ts`
- Modify: `src/app/api/payments/payhere/webhook/route.ts`
- Create: `tests/lib/payhere-process-receipt.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `tests/lib/payhere-process-receipt.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { db } from "@/db";
  import { profiles, plans, memberships, payments } from "@/db/schema";
  import { eq, like } from "drizzle-orm";
  import { _processWebhookUnsafe } from "@/lib/payhere/process";

  const CLERK_PREFIX = "user_phase6_test_receipt_";
  const PLAN_NAME = "Phase6ReceiptPlan";

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
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    planId = pl.id;
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "receipt@x.lk",
        fullName: "Receipt Member",
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

  function payload(reference: string) {
    return {
      merchant_id: "1230000",
      order_id: reference,
      payment_id: "PAY999",
      payhere_amount: "1500.00",
      payhere_currency: "LKR",
      status_code: "2" as const,
      md5sig: "VERIFIED-BY-ROUTE",
    };
  }

  describe("_processWebhookUnsafe — receipt context", () => {
    it("returns sendCtx on the first successful processing", async () => {
      const ref = "gym_receipt_test_1";
      await seedPending(ref);
      const result = await _processWebhookUnsafe({
        verified: payload(ref),
        todaySL: "2026-05-16",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe("succeeded");
      expect(result.sendCtx).toBeDefined();
      if (!result.sendCtx) return;
      expect(result.sendCtx.memberEmail).toBe("receipt@x.lk");
      expect(result.sendCtx.memberName).toBe("Receipt Member");
      expect(result.sendCtx.planName).toBe(PLAN_NAME);
      expect(result.sendCtx.amountLkr).toBe("1500.00");
      expect(result.sendCtx.newMembershipStart).toBe("2026-05-16");
      expect(result.sendCtx.newMembershipEnd).toBe("2026-06-14");
    });

    it("returns NO sendCtx on a duplicate webhook (already_processed)", async () => {
      const ref = "gym_receipt_test_2";
      await seedPending(ref);
      const first = await _processWebhookUnsafe({
        verified: payload(ref),
        todaySL: "2026-05-16",
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.outcome).toBe("succeeded");

      const second = await _processWebhookUnsafe({
        verified: payload(ref),
        todaySL: "2026-05-16",
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.outcome).toBe("already_processed");
      // Discriminated union — sendCtx only exists on the 'succeeded' branch
      expect("sendCtx" in second).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run — expect failure**

  ```powershell
  npm test -- tests/lib/payhere-process-receipt.test.ts
  ```

- [ ] **Step 3: Modify `src/lib/payhere/process.ts`**

  Open `src/lib/payhere/process.ts` and replace it with:

  ```ts
  import { db } from "@/db";
  import { payments, memberships, plans, profiles } from "@/db/schema";
  import { eq, and, desc } from "drizzle-orm";
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

  export type ReceiptContext = {
    memberEmail: string;
    memberName: string;
    planName: string;
    amountLkr: string;
    newMembershipStart: string;
    newMembershipEnd: string;
  };

  export type ProcessOutcome =
    | "succeeded"
    | "failed"
    | "still_pending"
    | "already_processed";
  export type ProcessReason = "row_not_found" | "amount_mismatch" | "no_plan";

  export type ProcessResult =
    | { ok: true; outcome: "succeeded"; sendCtx: ReceiptContext }
    | { ok: true; outcome: "failed" | "still_pending" | "already_processed" }
    | { ok: false; reason: ProcessReason };

  /**
   * Apply a signature-verified PayHere webhook to our payments row.
   *
   * On a fresh `succeeded` outcome, returns a `sendCtx` payload that the
   * route handler uses to fire a receipt email AFTER the transaction
   * commits. Duplicate deliveries (`already_processed`) return NO sendCtx.
   *
   * Concurrency: opens a transaction and acquires a row-level lock
   * (FOR UPDATE) on the payments row keyed by `reference + method='payhere'`.
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
      // Drizzle's typed `.for("update")` emits `FOR UPDATE` on this SELECT,
      // acquiring a row-level lock for the rest of the transaction. We avoid raw
      // `tx.execute(sql`... for update`)` because that returns snake_case columns
      // from the postgres-js driver, defeating the typed-row contract elsewhere.
      const [row] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.reference, orderId),
            eq(payments.method, "payhere"),
          ),
        )
        .limit(1)
        .for("update");
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
      // `isActive` is intentionally NOT filtered: if an admin disabled the plan
      // between the user's checkout click and PayHere's webhook, we still honor
      // the payment with the plan's stored `durationDays`. The plan's price was
      // already snapshotted onto `payments.amountLkr` at checkout time.
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

      // Capture sendCtx inside the txn so the route handler doesn't need a
      // re-SELECT after commit. Member profile is read here as the last step.
      const [member] = await tx
        .select({ email: profiles.email, fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, row.memberId))
        .limit(1);

      const sendCtx: ReceiptContext = {
        memberEmail: member?.email ?? "",
        memberName: member?.fullName ?? "",
        planName: plan.name,
        amountLkr: Number(row.amountLkr).toFixed(2),
        newMembershipStart: window.startDate,
        newMembershipEnd: window.endDate,
      };

      return { ok: true, outcome: "succeeded", sendCtx } as const;
    });
  }
  ```

- [ ] **Step 4: Modify `src/app/api/payments/payhere/webhook/route.ts`**

  Replace it with:

  ```ts
  import { NextResponse } from "next/server";
  import { verifyWebhookSignature } from "@/lib/payhere/sign";
  import {
    _processWebhookUnsafe,
    type VerifiedWebhookPayload,
  } from "@/lib/payhere/process";
  import { todayInSL } from "@/lib/tz";
  import { renderEmail } from "@/lib/email/render";
  import { PayhereReceiptEmail } from "@/lib/email/templates/payhere-receipt";
  import { makeResendMailer } from "@/lib/email/resend-mailer";

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

    // Fire receipt email AFTER the transaction commits, only on a fresh
    // success outcome. Receipt failure is best-effort: log and continue.
    if (result.ok && result.outcome === "succeeded" && result.sendCtx) {
      try {
        const mailer = makeResendMailer();
        const html = await renderEmail(
          <PayhereReceiptEmail
            memberName={result.sendCtx.memberName}
            planName={result.sendCtx.planName}
            amountLkr={result.sendCtx.amountLkr}
            newMembershipStart={result.sendCtx.newMembershipStart}
            newMembershipEnd={result.sendCtx.newMembershipEnd}
          />,
        );
        const send = await mailer.send({
          to: result.sendCtx.memberEmail,
          subject: `Payment received — ${result.sendCtx.planName}`,
          html,
        });
        if (!send.ok) {
          console.warn(
            `[payhere webhook] receipt send failed for ${result.sendCtx.memberEmail}: ${send.error}`,
          );
        }
      } catch (err) {
        console.warn(
          `[payhere webhook] receipt path threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

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

  Note the file extension change: route.ts must support JSX since we're rendering `<PayhereReceiptEmail ... />`. Next.js handles `.tsx` route files identically — if your existing webhook route is `.ts`, rename it to `.tsx`:

  ```powershell
  Move-Item src/app/api/payments/payhere/webhook/route.ts src/app/api/payments/payhere/webhook/route.tsx
  ```

  If you're on bash:
  ```bash
  mv src/app/api/payments/payhere/webhook/route.ts src/app/api/payments/payhere/webhook/route.tsx
  ```

- [ ] **Step 5: Run all webhook-related tests to confirm backwards-compat**

  ```powershell
  npm test -- tests/lib/payhere-process.test.ts tests/lib/payhere-process-receipt.test.ts tests/app/api/payhere/webhook-route.test.ts
  ```

  Expected: all pass. The existing 10 `payhere-process.test.ts` tests don't pass a mailer and exercise the no-mail path. The new 2 receipt tests exercise the new sendCtx path. The 4 webhook-route tests exercise the integration without a real Resend (they don't mock the mailer factory but PayHere webhook tests use status_code values that DON'T match real signed payloads, so the route returns 401 BEFORE reaching the receipt send — they should still pass).

  If `webhook-route.test.ts` fails on the "succeeded" test because the receipt path crashes (no `RESEND_API_KEY` in env), the fix is to either:
  - Add `process.env.RESEND_API_KEY = "re_test_dummy"` and `process.env.EMAIL_FROM = "test@example.com"` to the test's `beforeEach`, OR
  - Mock `@/lib/email/resend-mailer` in the test file to return a fake mailer.

  Recommended fix:

  Open `tests/app/api/payhere/webhook-route.test.ts` and add at the top, BEFORE the `import { POST } from ...` line:

  ```ts
  import { vi } from "vitest";
  vi.mock("@/lib/email/resend-mailer", () => ({
    makeResendMailer: () => ({
      async send() { return { ok: true as const }; },
    }),
  }));
  ```

- [ ] **Step 6: Run the full suite to confirm no other regression**

  ```powershell
  npm test
  ```

  Expected: all tests pass. Target count: 192 baseline + Task 1 (15) + Task 4 (4) + Task 5 (5) + Task 6 (3) + Task 7 (2) = 221 total.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/lib/payhere/process.ts src/app/api/payments/payhere/webhook tests/lib/payhere-process-receipt.test.ts tests/app/api/payhere/webhook-route.test.ts
  git commit -m "feat: PayHere webhook fires receipt email on succeeded payment"
  ```

  If the rename `route.ts` → `route.tsx` happened, git will record the rename automatically in the same commit.

---

## Task 8: Wire the new cron — `wrangler.jsonc` + dispatcher ROUTES

**Why:** Add the 4th cron schedule. The Phase 5 dispatcher already handles internal-fetch dispatch; just adding one ROUTES entry + one cron expression.

**Files:**
- Modify: `src/worker-with-scheduled.ts`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Modify `src/worker-with-scheduled.ts`**

  Open the file and update the `ROUTES` map to add the reminders entry:

  ```ts
  const ROUTES: Record<string, string> = {
    "30 18 * * *": "/api/cron/expire-memberships",
    "0 19 * * *": "/api/cron/inactivate-stale-members",
    "30 1 * * *": "/api/cron/send-reminders",
    "0 * * * *": "/api/cron/reconcile-payhere",
  };
  ```

  (One new line: `"30 1 * * *": "/api/cron/send-reminders",`)

- [ ] **Step 2: Modify `wrangler.jsonc`**

  Open the file and update the `triggers.crons` array. Full updated file:

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

  (One new line: `"30 1 * * *",`)

- [ ] **Step 3: Update the dispatcher's tests**

  Open `tests/worker/scheduled-dispatcher.test.ts` and add one test (don't remove any existing tests). Append before the closing `});` of the outer `describe`:

  ```ts
    it("fetches /api/cron/send-reminders for the 30 1 * * * cron", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const { default: worker } = await import("@/worker-with-scheduled");
      const ctx = makeCtx();
      await worker.scheduled(
        { cron: "30 1 * * *" } as unknown as ScheduledEvent,
        {
          CRON_SECRET: "secret-x",
          WORKER_HOSTNAME: "gym.example",
        } as unknown as Env,
        ctx as unknown as ExecutionContext,
      );
      await ctx.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://gym.example/api/cron/send-reminders");
    });
  ```

- [ ] **Step 4: Run dispatcher tests**

  ```powershell
  npm test -- tests/worker/scheduled-dispatcher.test.ts
  ```

  Expected: 4/4 pass (3 existing + 1 new).

- [ ] **Step 5: Verify cf:build still resolves**

  ```powershell
  npm run cf:build
  ```

  Expected: success. The dispatcher still imports `.open-next/worker.js`; we only changed string-mapping data.

  If the build hits the recurring Windows webpack/Defender corruption, clean and retry:

  ```powershell
  Remove-Item -Recurse -Force .next, .open-next, node_modules/.cache -ErrorAction SilentlyContinue
  npm run cf:build
  ```

- [ ] **Step 6: Run the full suite**

  ```powershell
  npm test
  ```

  Expected: ~222 tests passing.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/worker-with-scheduled.ts wrangler.jsonc tests/worker/scheduled-dispatcher.test.ts
  git commit -m "feat: wire send-reminders cron (07:00 SL) via dispatcher + wrangler.jsonc"
  ```

---

## Task 9: End-to-end + Phase 6 tag

**Why:** Verify the full Phase 6 surface works locally, then tag the milestone.

- [ ] **Step 1: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: ~222 tests passing across ~43 files (192 baseline + 30 new).

- [ ] **Step 2: Run the production build**

  ```powershell
  npm run build
  ```

  Expected: success. New route `/api/cron/send-reminders` should appear in the route table.

- [ ] **Step 3: Run the cf:build**

  ```powershell
  npm run cf:build
  ```

  Expected: success.

- [ ] **Step 4: Verify wrangler still bundles**

  ```powershell
  npx wrangler deploy --dry-run --outdir tmp-wrangler-out
  ```

  Expected: success with `WORKER_HOSTNAME` listed under bindings. Cleanup:

  ```powershell
  Remove-Item -Recurse -Force tmp-wrangler-out
  ```

- [ ] **Step 5: Manual curl smoke against `npm run dev` (optional)**

  In one PowerShell window:

  ```powershell
  $env:CRON_SECRET = "local-dev-cron-secret"
  $env:RESEND_API_KEY = "re_dev_dummy"
  $env:EMAIL_FROM = "onboarding@resend.dev"
  $env:APP_URL = "http://localhost:3000"
  npm run dev
  ```

  In a second window:

  ```powershell
  curl.exe -X POST http://localhost:3000/api/cron/send-reminders `
    -H "authorization: Bearer local-dev-cron-secret"
  ```

  Expected: 200 + `{"evaluated":N,"sent_3d":0,"sent_1d":0,"sent_overdue":0,"skipped":N,"failed":0}` (or non-zero counts depending on dev DB state). The `re_dev_dummy` key means Resend rejects sends — so any real members in the dev DB in a reminder window will count as `failed`, not `sent_*`. That's expected for a dry-run smoke.

  For a true send-side smoke, replace `RESEND_API_KEY` with a real key from a resend.com signup and seed a test member with `email = <your-signup-email>`. Check your inbox.

- [ ] **Step 6: Tag the milestone**

  ```powershell
  git tag phase-6
  ```

  Do NOT push without explicit user authorization (Phase 3, 4, 5 are also unpushed).

- [ ] **Step 7: Update project memory**

  Update `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` by appending a Phase 6 status block. Include:

  - Tag `phase-6` at the green HEAD.
  - What shipped: 4 templates, decideReminder helper, `_sendRemindersUnsafe`, send-reminders cron + endpoint + dispatcher wiring, PayHere webhook receipt path, Mailer interface + Resend factory, ~30 new tests.
  - What's deferred: WhatsApp channel (cost-deferred), bounce webhook integration, retry queue, member-approval welcome email, production-grade verified email domain, live cron firing (still gated on the OpenNext deploy gap).
  - Note that `RESEND_API_KEY` and `EMAIL_FROM` are new env vars; in dev the sandbox sender `onboarding@resend.dev` works, in production these need real values.
  - Webhook route file was renamed `route.ts` → `route.tsx` to support inline JSX for the receipt template.

---

## Self-Review

**Spec coverage:**

| Design section | Covered by |
|---|---|
| §2.1 send-reminders route | Task 6 |
| §2.1 webhook route gains receipt fire | Task 7 |
| §3.1 Mailer interface | Task 2 |
| §3.2 makeResendMailer factory | Task 3 |
| §3.3 decideReminder pure logic + 15 branches | Task 1 |
| §3.4 _sendRemindersUnsafe + ReminderSummary | Task 5 |
| §3.5 ProcessResult discriminated union with sendCtx | Task 7 |
| §4.1 reminder cron data flow | Tasks 5, 6, 8 |
| §4.2 PayHere receipt data flow | Task 7 |
| §5 error handling (every row in the table) | Tests in Tasks 1, 5, 6, 7 + warn-not-throw branches |
| §6 env vars (RESEND_API_KEY, EMAIL_FROM) | Conventions section + Task 3 reads them |
| §7.1 decideReminder unit tests (~15) | Task 1 |
| §7.2 template smoke tests (4) | Task 4 |
| §7.3 _sendRemindersUnsafe integration (5) | Task 5 |
| §7.4 cron route tests (3) | Task 6 |
| §7.5 webhook receipt integration (2) | Task 7 |
| §7.6 no existing test changes | Task 7 Step 5 (preserves 10 Phase 4 tests + adds mailer mock to webhook-route test) |
| §7.7 local E2E smoke (manual) | Task 9 Step 5 |
| §8 done criteria | Task 9 |
| §9 deferrals | Documented; not implemented |

**Placeholder scan:** no "TBD", "TODO", or "similar to" — every step has runnable code or runnable commands. Two pieces of fallback guidance:
- Task 5 Step 4 has a concrete switch-statement fallback if Drizzle's dynamic `.set({ [col]: ... })` syntax rejects the type. The fallback is fully-typed and immediately runnable.
- Task 7 Step 5 has a concrete `vi.mock` snippet if existing webhook-route tests hit the new receipt path; copy-paste-ready.

**Type consistency:**
- `Mailer`, `SendOpts`, `SendResult` from Task 2 are imported in Tasks 3, 5, 6, 7.
- `DecideMember`, `DecideMembership`, `DecideResult`, `ReminderKind` from Task 1 are used in Task 5.
- `ReminderSummary` from Task 5 is the return type asserted in Task 6's route tests.
- `ReceiptContext` and `ProcessResult` (discriminated union) from Task 7 are exercised by both Task 7 tests + the existing 10 Phase 4 `payhere-process.test.ts` tests (the latter exercise the no-mail branches that don't include `sendCtx`).
- All cron route handlers export `POST` and read `CRON_SECRET`; bearer compare uses exact string match against `` `Bearer ${cronSecret}` ``.
- `_*Unsafe` naming convention preserved across Tasks 1, 5, 7.

Verified consistent.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time with review between each commit.*
