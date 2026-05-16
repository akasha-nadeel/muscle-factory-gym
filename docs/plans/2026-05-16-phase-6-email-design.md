# Phase 6 — Transactional Email (Reminders + PayHere Receipt)

**Date:** 2026-05-16
**Status:** Approved (design phase; implementation plan to follow)
**Scope:** 4 emails total — the design-doc reminder trio (3-day / 1-day / overdue) plus the PayHere receipt deferred from Phase 4. React Email templates. Resend SDK. New daily cron at 07:00 SL wired through the Phase 5 dispatcher.

---

## 1. Context

The original design doc (`2026-05-14-gym-management-system-design.md` §4.6) called
for three reminder emails (3d / 1d / overdue) via Resend. Phase 4 added a
PayHere receipt as a likely add (deferred per project memory). Phase 5 shipped
the cron infrastructure but explicitly skipped all email work.

This phase fills in that gap: ship four transactional emails on top of the
Phase 5 `scheduled()` dispatcher, using React Email components for templates and
a `Mailer` interface that wraps Resend.

### User decisions locked in before brainstorming

- **Channel:** email only. WhatsApp considered and explicitly deferred for cost
  reasons ($0 vs ~$10–50/yr at gym scale).
- **Email scope:** trio of reminders + PayHere receipt. No member-approval
  welcome email this phase.
- **Templates:** React Email components (TSX → inline-styled HTML via
  `@react-email/render`).
- **Resend account state:** build against sandbox. `onboarding@resend.dev` as
  the default sender; verified domain flip is config-only later.

### User decisions locked in during brainstorming

- **Reminder cron time:** 07:00 SL = `"30 1 * * *"` UTC.
- **Stamp order:** send-then-stamp. Stamp only on `mailer.send` success.
- **Receipt failure semantics:** log + return 200 OK. Receipt is best-effort;
  PayHere payments must not be rolled back on email failure.
- **Mailer abstraction:** `Mailer` interface in `src/lib/email/mailer.ts`,
  `ResendMailer` implementation, `fakeMailer` for tests.

---

## 2. Architecture

```
src/lib/email/
  mailer.ts             # Mailer interface only (no deps)
  resend-mailer.ts      # makeResendMailer() factory wraps Resend SDK
  render.ts             # renderEmail() wraps @react-email/render
  decide-reminder.ts    # PURE: decideReminder(member, latest, today)
  templates/
    reminder-3d.tsx
    reminder-1d.tsx
    reminder-overdue.tsx
    payhere-receipt.tsx

src/lib/cron/
  send-reminders.ts     # _sendRemindersUnsafe(mailer, todaySL, appUrl)

src/lib/payhere/
  process.ts            # _processWebhookUnsafe gains optional `mailer` +
                        # returns ReceiptContext on success outcome

src/app/api/
  cron/send-reminders/route.ts        # NEW: bearer-guarded thin shell
  payments/payhere/webhook/route.ts   # MODIFIED: builds mailer + fires receipt
                                       # after _processWebhookUnsafe commits

src/worker-with-scheduled.ts          # MODIFIED: ROUTES gains the new cron
wrangler.jsonc                        # MODIFIED: triggers.crons gains "30 1 * * *"
```

### 2.1 HTTP entry points

| Path | Purpose | Auth |
|---|---|---|
| `POST /api/cron/send-reminders` | Daily reminder dispatch. | `Authorization: Bearer ${CRON_SECRET}`. |

The existing `/api/payments/payhere/webhook` gets one additive change inside
the route handler: build a `Mailer` and pass it into `_processWebhookUnsafe`,
then fire the receipt after the helper returns.

### 2.2 No schema changes

`memberships.reminder_3d_sent_at`, `reminder_1d_sent_at`,
`last_overdue_reminder_at` were added in Phase 1. They're all
`timestamp with time zone, nullable` — null means "never sent".

---

## 3. Component contracts

### 3.1 `Mailer` interface

```ts
// src/lib/email/mailer.ts
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

Pure interface, no dependencies. Tests import this type and define a
`fakeMailer` inline. Production uses `makeResendMailer()`.

### 3.2 `makeResendMailer()` factory

```ts
// src/lib/email/resend-mailer.ts
import { Resend } from "resend";
import type { Mailer } from "./mailer";

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
          from, to: opts.to, subject: opts.subject, html: opts.html,
        });
        if (r.error) return { ok: false, error: r.error.message };
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

Factory function (not const export) so env reads happen at call time.

### 3.3 `decideReminder` (pure)

```ts
export type ReminderKind = "3d" | "1d" | "overdue";

export type DecideMember = {
  status: "active" | "pending" | "inactive";
  role: "admin" | "member";
};

export type DecideMembership = {
  status: "active" | "expired" | "cancelled";
  endDate: string;  // YYYY-MM-DD
  reminder3dSentAt: Date | null;
  reminder1dSentAt: Date | null;
  lastOverdueReminderAt: Date | null;
};

export type DecideResult =
  | { kind: ReminderKind }
  | { kind: null; reason: string };

export function decideReminder(
  member: DecideMember,
  latestMembership: DecideMembership | null,
  todaySL: string,  // YYYY-MM-DD
): DecideResult;
```

**Decision tree (in priority order):**

1. `member.status !== 'active' || member.role !== 'member'` → `{ kind: null, reason: 'member_not_active' }`
2. `latestMembership === null` → `{ kind: null, reason: 'no_membership' }`
3. `latestMembership.status === 'cancelled'` → `{ kind: null, reason: 'cancelled' }`
4. Compute `daysRemaining = parseISO(latestMembership.endDate) - parseISO(todaySL)` in days.
5. If `status === 'active'` AND `daysRemaining >= 1 AND daysRemaining <= 1` AND `reminder1dSentAt === null` → `'1d'` (priority: catches the case where endDate is exactly 1 day away)
6. If `status === 'active'` AND `daysRemaining >= 2 AND daysRemaining <= 3` AND `reminder3dSentAt === null` → `'3d'`
7. If `status === 'active'` AND `daysRemaining === 0` AND `reminder1dSentAt === null` → `'1d'` (defensive: expire cron hasn't run yet, today is the expiry date)
8. If `status === 'expired'` AND (`lastOverdueReminderAt === null` OR `lastOverdueReminderAt::date < todaySL::date`) → `'overdue'`
9. Otherwise → `{ kind: null, reason: '<descriptive>' }`

**Missed-cron-day handling:** the 3d branch accepts a window of `[2, 3]` days
remaining (not just `=3`), so a cron that missed yesterday still fires the 3d
for someone who is now 2 days out. The 1d strictly fires at 1 day remaining; if
that day's cron is missed, the member skips to overdue once expire-cron flips
them.

### 3.4 `_sendRemindersUnsafe`

```ts
export type ReminderSummary = {
  evaluated: number;
  sent_3d: number;
  sent_1d: number;
  sent_overdue: number;
  skipped: number;
  failed: number;
};

export async function _sendRemindersUnsafe(input: {
  mailer: Mailer;
  todaySL: string;
  appUrl: string;
}): Promise<ReminderSummary>;
```

Iterates every active member, runs `decideReminder`, renders the matching
template, calls `mailer.send`, and stamps the corresponding column on success.
Pure-ish helper: no auth gate, no HTTP, no env reads (env-derived inputs are
arguments).

### 3.5 `_processWebhookUnsafe` (modified)

```ts
export type ReceiptContext = {
  memberEmail: string;
  memberName: string;
  planName: string;
  amountLkr: string;
  newMembershipStart: string;
  newMembershipEnd: string;
};

export type ProcessResult =
  | { ok: true; outcome: 'succeeded'; sendCtx: ReceiptContext }
  | { ok: true; outcome: 'failed' | 'still_pending' | 'already_processed' }
  | { ok: false; reason: ProcessReason };
```

`sendCtx` appears ONLY on the first `succeeded` outcome — duplicate webhook
deliveries return `already_processed` with no `sendCtx`, so the route handler
never double-sends a receipt.

The helper signature stays backwards-compatible: callers that don't pass a
`mailer` still get the existing behavior. Phase 4's 10 webhook tests don't
change.

---

## 4. Data flow

### 4.1 Reminder cron (07:00 SL daily)

```
CF cron fires "30 1 * * *"
   │
   ▼
worker-with-scheduled.scheduled(event)
   ROUTES["30 1 * * *"] = "/api/cron/send-reminders"
   ctx.waitUntil(fetch(`https://${host}/api/cron/send-reminders`, Bearer))
   │
   ▼
route handler: env-check → bearer-check → makeResendMailer() → call helper
   │
   ▼
_sendRemindersUnsafe({ mailer, todaySL, appUrl })
   │
   ▼
SELECT profiles.*, latest.*
FROM profiles
LEFT JOIN LATERAL (
  SELECT * FROM memberships
  WHERE member_id = profiles.id
  ORDER BY end_date DESC
  LIMIT 1
) latest ON true
WHERE profiles.status = 'active' AND profiles.role = 'member'
   │
   ▼
for each row:
  summary.evaluated++
  decision = decideReminder(member, latest, todaySL)
  if (decision.kind === null) { summary.skipped++; continue }
  html = await renderEmail(<RemindXX memberName planName endDate appUrl />)
  result = await mailer.send({ to: member.email, subject, html })
  if (!result.ok) {
    console.warn(`[reminders] ${member.email} ${decision.kind}: ${result.error}`)
    summary.failed++
    continue  // ← no stamp, tomorrow retries
  }
  await db.update(memberships).set({
    [stampColumnFor(decision.kind)]: new Date()
  }).where(eq(memberships.id, latest.id))
  summary[`sent_${decision.kind}`]++
   │
   ▼
return summary
```

**Stamp column mapping:**
- `'3d'` → `reminder3dSentAt`
- `'1d'` → `reminder1dSentAt`
- `'overdue'` → `lastOverdueReminderAt`

**Idempotency:** Re-running an hour later flips zero new emails — every member
who got a send has their stamp set; `decideReminder` returns `null` for them.

### 4.2 PayHere receipt (synchronous to webhook success)

```
PayHere → POST /api/payments/payhere/webhook
   │
   ▼
webhook route: env-check → md5 verify → call _processWebhookUnsafe(verified, todaySL, mailer)
   │
   ▼
_processWebhookUnsafe inside db.transaction:
   row-level lock → idempotency check → amount check
   status_code=2 path:
     insert membership, flip payments.status='succeeded'
     capture { memberEmail, memberName, planName, amountLkr, start, end }
   COMMIT
   return { ok: true, outcome: 'succeeded', sendCtx: { ... } }
   │
   │ (transaction released; lock gone)
   ▼
webhook route:
if (result.ok && result.outcome === 'succeeded' && result.sendCtx) {
   html = await renderEmail(<PayhereReceipt ... />)
   sendResult = await mailer.send({ to: sendCtx.memberEmail, subject, html })
   if (!sendResult.ok) console.warn(`[receipt] ${sendCtx.memberEmail}: ${sendResult.error}`)
}
   │
   ▼
return 200 (always — receipt failure does NOT propagate)
```

**Why outside the transaction:** Resend round-trip is 200–500ms. Inside the
txn that holds the row lock open for the entire send window. Outside the txn,
the lock releases immediately after the DB writes commit.

**Why capture-inside / send-outside:** the data needed for the template
(member email, plan name, etc.) is available cheaply inside the txn. Capturing
into the returned `sendCtx` avoids a re-SELECT and keeps `_processWebhookUnsafe`
ignorant of the Mailer interface.

**Duplicate deliveries:** PayHere retries on non-2xx; our webhook always
returns 200 after signature verification. If a duplicate arrives anyway, the
row lock + idempotency check returns `outcome: 'already_processed'` with NO
`sendCtx`, and the route handler doesn't fire the receipt.

---

## 5. Error handling

| Failure | Handling |
|---|---|
| `RESEND_API_KEY` or `EMAIL_FROM` not set | `makeResendMailer()` throws. Cron route returns 500. Webhook route logs warn but still 200s (mailer is optional in `_processWebhookUnsafe`). |
| Resend rate limit (429) | `mailer.send` returns `{ ok: false }`. Cron: `summary.failed++`, no stamp, tomorrow retries. Webhook: log + 200. |
| Resend 401 / suspended | Same as above. Logged loudly so admin notices. |
| Network blip on Resend request | SDK throws → caught in `makeResendMailer()` → `{ ok: false }`. Same fail path. |
| React Email render throws | Caught at the call site → cron: `failed++` and skip row; webhook: log + 200. |
| Member email null/empty | Guard in cron loop (skip + `failed++`). Schema marks `email` as `notNull` so this is defensive only. |
| Hard bounce | Resend internal flag; SDK still returns ok. Visible in Resend dashboard. No retry. |
| Cron handler timeout (CF 30s) | Mid-loop. Outstanding sends abandoned; processed-so-far stamps remain. Tomorrow picks up the unstamped tail. |
| `_sendRemindersUnsafe` throws (DB error) | Propagates to route → 500. Dispatcher logs. Tomorrow retries. |
| Receipt during webhook txn | N/A — by design we send AFTER commit. |
| Duplicate webhook | `_processWebhookUnsafe` returns `outcome: 'already_processed'` with no `sendCtx` → route skips the send. |
| `mailer.send` rejects in webhook | `try/catch` at the send-site → `console.warn` + return 200. |
| Member with `phone` set but no `email` | Skip + log. Future WhatsApp channel would catch this. |
| Multiple webhooks within seconds | First gets lock + `sendCtx`; rest see `already_processed`. Exactly one receipt. |
| Membership cancelled mid-cron | Snapshot read before iteration; stamp may write to a now-cancelled row. Acceptable — stamp persists; no duplicate next day. |

### 5.1 Observability

Every error path logs via `console.warn`. The cron's response JSON includes
counts (`evaluated`, `sent_3d`, `sent_1d`, `sent_overdue`, `skipped`, `failed`)
for at-a-glance health. CF Workers Observability surfaces the warn lines.

### 5.2 No retry queue

Failed reminders try again tomorrow. Failed receipts log but never re-fire
(webhook only emits the receipt on the first success). At single-gym volume
(200–500 members), manual investigation via the Resend dashboard is faster
than building a retry table.

### 5.3 No bounce handling

Resend's bounce-webhook integration is not wired in this phase. Bounces show
in the Resend dashboard; admin investigates manually or members complain at
the front desk.

---

## 6. Environment variables

Added this phase:

```
RESEND_API_KEY=re_xxx               # from resend.com signup (Resend's free tier: 3000 emails/mo)
EMAIL_FROM=onboarding@resend.dev    # Resend sandbox sender; flip to noreply@<verified-domain> later
```

In dev, `EMAIL_FROM=onboarding@resend.dev` works out of the box: Resend's
free tier sends mail to your signup email address only (the sandbox
constraint) without requiring a verified domain. Production needs a verified
domain.

Reused from prior phases: `CRON_SECRET`, `APP_URL`.

---

## 7. Testing

### 7.1 Pure logic — `decideReminder` (~15 tests)

`tests/lib/email-decide-reminder.test.ts`:

- Inactive member → null
- Pending member → null
- Admin role → null
- No memberships → null
- Active membership, 5 days remaining → null (too early)
- Active membership, 3 days remaining, both stamps null → `'3d'`
- Active membership, 2 days remaining, `reminder_3d_sent_at` null → `'3d'` (catch-up)
- Active membership, 2 days remaining, `reminder_3d_sent_at` set → null
- Active membership, 1 day remaining, `reminder_1d_sent_at` null → `'1d'`
- Active membership, 1 day remaining, `reminder_1d_sent_at` set → null
- Active membership, 1 day remaining, both stamps null → `'1d'` (priority over 3d)
- Active membership, 0 days remaining (endDate === today), `reminder_1d_sent_at` null → `'1d'` (defensive)
- Expired membership, `last_overdue_reminder_at` null → `'overdue'`
- Expired membership, `last_overdue_reminder_at::date < today` → `'overdue'`
- Expired membership, `last_overdue_reminder_at::date === today` → null
- Cancelled membership → null

### 7.2 Template smoke (~4 tests)

`tests/lib/email-templates.test.ts`:

Each of the 4 templates renders via `renderEmail()` and the returned HTML
contains the expected member name, plan name, and CTA URL. Catches accidental
JSX breakage (missing prop, bad import).

### 7.3 DB integration — `_sendRemindersUnsafe` (~5 tests)

`tests/lib/email-send-reminders.test.ts`. `fakeMailer` captures sends.
`phase6_test_reminders_*` clerk-prefix isolation.

- Happy path: 3 members in different windows (3d/1d/overdue) → 3 sends, 3 stamps, summary correct
- Send failure: `fakeMailer.send` returns `{ ok: false }` once → that row's stamp stays null, `summary.failed === 1`
- Idempotent on re-run: second run produces zero sends
- Inactive member skipped
- Mixed batch (5 members, 2 eligible, 3 not): exactly 2 sends, correct kinds

### 7.4 Route — `cron-send-reminders-route.test.ts` (~3 tests)

`vi.mock("@/lib/email/resend-mailer")` returns a `fakeMailer`. No real Resend
calls in tests.

- 401 without bearer
- 401 wrong bearer
- 200 + summary JSON shape

### 7.5 Webhook receipt — `payhere-process-receipt.test.ts` (~2 tests)

- Webhook success with mailer → fakeMailer captured exactly 1 send to the
  member's email, subject contains plan name, html contains amount; helper
  returns `sendCtx`
- Webhook success without mailer (backwards-compat) → helper still returns
  `sendCtx`, no exception, payment row succeeded, membership created

### 7.6 No changes to existing tests

The 10 Phase 4 `_processWebhookUnsafe` integration tests don't pass a
`mailer`, so they continue to exercise the no-mail backwards-compat path. The
helper signature gains an optional parameter; existing callers unchanged.

### 7.7 Local E2E (manual, optional)

1. Sign up at resend.com; copy API key to `.env.local`.
2. Set `EMAIL_FROM=onboarding@resend.dev`.
3. Seed a member with `email = <your verified Resend signup email>` and an
   active membership ending in 3 days.
4. `curl -X POST http://localhost:3000/api/cron/send-reminders -H "authorization: Bearer <CRON_SECRET>"`.
5. Check the inbox.
6. For receipts: use the PowerShell smoke script from Phase 4 memory with
   `status_code=2` → check the inbox.

### 7.8 Coverage target

192 existing tests + ~29 new = ~221 across ~43 files.

---

## 8. Done criteria

1. All new tests green; existing 192 still pass.
2. `npm run build` green.
3. `npm run cf:build` green (proves Resend SDK + React Email work on the CF
   Workers bundle).
4. Tag `phase-6` at the green HEAD.

Production deploy + actual cron firing remain gated on the OpenNext/CF deploy
gap. Phase 6 ships code-and-tests complete, same posture as Phases 1–5.

---

## 9. What's deferred

- **WhatsApp channel** — cost analysis flagged ~$10–50/yr at scale; user opted to wait until revenue.
- **Bounce webhook integration** — Resend supports it; not wired this phase.
- **Retry queue for failed sends** — single-gym scale doesn't justify it; manual investigation via Resend dashboard.
- **Member-approval welcome email** — considered, deferred.
- **Production-grade email domain** — sandbox flow until customer hands off a verified domain.
- **Email open / click tracking** — Resend offers it; not enabled this phase.
- **Live cron firing on production** — gated on the OpenNext/CF deploy debugging.
