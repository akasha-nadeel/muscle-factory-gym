# Phase 4 — PayHere online payments (sandbox-only)

**Date:** 2026-05-16
**Status:** Approved (design phase; implementation plan to follow)
**Scope:** Sandbox round-trip only. Live-mode flip is config + merchant onboarding, not code.

---

## 1. Context

Phase 2 shipped manual payments (cash, bank transfer). Phase 4 adds the third
`payment_method` enum value that's already in the schema: `payhere`. The
machinery is a payment that exists in `pending` state between the moment a
member clicks "Pay" and the moment PayHere's webhook confirms (or denies) the
charge.

Constraints carried from the project's design doc (`2026-05-14-gym-management-system-design.md` §4.3):

- One `payments` row per attempt, idempotent webhook delivery
- MD5-signed checkout payload built server-side
- Signature-verified webhook
- Nightly reconciliation cron for stuck pending rows
- Member-portal "payment confirmed" polling page

What's **deferred** from this phase:

- The checkout UI surface (portal button, admin button). Endpoints will be built
  and curl-testable; the buttons land in a later iteration.
- PayHere refund API integration. Refunds stay bookkeeping-only — admin
  processes the refund in PayHere's merchant dashboard, then records it via
  Phase 2's existing `_refundPaymentUnsafe`.
- Scheduling the reconciliation cron. The endpoint is built + tested in Phase 4;
  the `triggers.crons` block in `wrangler.jsonc` is wired in Phase 5
  alongside the other crons.
- Receipt emails (Phase 5 wires Resend).

---

## 2. Architecture

The state machine for an online payment:

```
(user click)                            (webhook arrives)
    │                                         │
    ▼                                         ▼
[no row] ──INSERT──▶ pending ──UPDATE──▶ succeeded
                       │                      │
                       │                      └──INSERT──▶ memberships row
                       │
                       └──UPDATE──▶ failed   (cron, or webhook status_code≠2)
```

### 2.1 HTTP entry points

| Path                                       | Purpose                                                            | Auth                                          |
| ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------- |
| `POST /api/payments/payhere/checkout`      | Insert pending row, return HTML that auto-posts to PayHere checkout. | Clerk session (member, role=member, status=active). |
| `POST /api/payments/payhere/webhook`       | Verify MD5, flip row + create membership atomically.               | PayHere `md5sig` against `PAYHERE_MERCHANT_SECRET`. |
| `GET  /api/payments/payhere/status/[ref]`  | Polled by the confirm page. Returns current `payments.status`.     | Clerk session, must own the row.              |
| `POST /api/cron/reconcile-payhere`         | Poll PayHere for stuck pendings >1h old. Endpoint only; scheduling deferred to Phase 5. | `Authorization: Bearer ${CRON_SECRET}`. |

### 2.2 New page

`/portal/pay/confirm?ref=gym_<uuid>` — client component, polls the status
endpoint every 2s. Renders green when `succeeded`, red when `failed`,
"still confirming" after 30s.

### 2.3 No new tables

All state lives on existing `payments` and `memberships` rows. **One additive
schema change**: nullable `payments.plan_id` (FK to `plans`). Required by the
webhook handler to know `duration_days` when creating the membership row.
Populated only for PayHere payments; manual payments leave it null.

---

## 3. File layout

Mirroring `src/lib/payments/`:

```
src/lib/payhere/
  sign.ts              # buildCheckoutFields, verifyWebhookSignature (pure)
  reference.ts         # generateOrderReference() → "gym_<uuid>"
  checkout.ts          # _createCheckoutUnsafe(tx, input)
  process.ts           # _processWebhookUnsafe(tx, verified)
  reconcile.ts         # _reconcilePendingUnsafe(tx, fetchStatusFn, nowMs)
  api.ts               # fetchPayHereStatus(reference) — real HTTP

src/lib/memberships/
  next-window.ts       # computeNextMembershipWindow (stacking math)

src/app/api/payments/payhere/
  checkout/route.ts    # thin: auth → _createCheckoutUnsafe → auto-post HTML
  webhook/route.ts     # thin: verify → _processWebhookUnsafe → 200/401
  status/[ref]/route.ts

src/app/api/cron/
  reconcile-payhere/route.ts  # thin: bearer → _reconcilePendingUnsafe

src/app/portal/pay/confirm/
  page.tsx
  _poll.tsx            # client polling component

drizzle/0004_*.sql     # add payments.plan_id (nullable FK)
```

Tests mirror the same structure under `tests/lib/payhere-*.test.ts` and
`tests/app/api/payhere-*.test.ts`.

---

## 4. Data flow

### 4.1 Checkout

```
member → POST /api/payments/payhere/checkout { planId }
         │
         ├─ Clerk auth → memberProfile (must be role=member, status=active)
         ├─ db.transaction:
         │    plan = SELECT plans WHERE id=planId AND is_active
         │    INSERT payments (
         │      memberId, membershipId=NULL,
         │      planId=plan.id,                  ← new column
         │      amountLkr=plan.priceLkr, method='payhere',
         │      kind='membership', status='pending',
         │      reference='gym_<uuid>', recordedBy=memberId
         │    )
         └─ return HTML that auto-POSTs CheckoutFields to PayHere checkout URL
              ↓
        PayHere hosted checkout
              ↓
        member completes/cancels
              ↓
        PayHere → 303 redirect to APP_URL/portal/pay/confirm?ref=gym_<uuid>
                            (or cancel_url with same shape)
```

The signed `hash` is computed as:

```
hash = MD5(
  MERCHANT_ID
  + ORDER_ID
  + AMOUNT          // "1500.00", not "1500"
  + CURRENCY        // "LKR"
  + MD5(MERCHANT_SECRET).toUpperCase()
).toUpperCase()
```

### 4.2 Webhook

```
PayHere → POST /api/payments/payhere/webhook
         (form-encoded: merchant_id, order_id, payment_id,
          payhere_amount, payhere_currency, status_code, md5sig, ...)
         │
         ├─ verifyWebhookSignature(payload, PAYHERE_MERCHANT_SECRET)
         │    fail → 401 (PayHere retries)
         │
         ├─ db.transaction:
         │    row = SELECT * FROM payments
         │          WHERE reference=order_id AND method='payhere'
         │          FOR UPDATE
         │
         │    row not found:           → 200 { reason: 'row_not_found' }, log
         │    row.status='succeeded':  → 200 { outcome: 'already_processed' }
         │    amount mismatch:         → 200 { reason: 'amount_mismatch' }, log loudly
         │                               (row stays pending — admin investigates)
         │
         │    status_code=2 (success):
         │       UPDATE payments SET status='succeeded', paid_at=now
         │       latestActive = SELECT memberships WHERE memberId AND status='active'
         │                      ORDER BY end_date DESC LIMIT 1
         │       window = computeNextMembershipWindow({
         │                  today: todayInSL(),
         │                  durationDays: plan.duration_days,
         │                  latestActiveEndDate: latestActive?.endDate ?? null
         │                })
         │       INSERT memberships (memberId, planId, start, end,
         │                           status='active', createdBy=memberId)
         │       UPDATE payments SET membership_id = new.id
         │
         │    status_code in (-1, -2, -3):  → UPDATE payments SET status='failed'
         │    status_code=0 (still pending): → no-op
         │
         └─ HTTP 200 (always, post-verify; non-2xx triggers PayHere retries)
```

**Double-delivery safety**: `FOR UPDATE` serializes concurrent webhooks for the
same `order_id`; the loser sees `status='succeeded'` and exits via the
`already_processed` branch. The `payments_reference_succeeded_unique` partial
unique index (already shipped in Phase 2) is the second safety net.

### 4.3 Reconciliation

```
cron → POST /api/cron/reconcile-payhere
       Authorization: Bearer ${CRON_SECRET}
       │
       ├─ pending = SELECT payments
       │            WHERE status='pending' AND method='payhere'
       │              AND paid_at < now - 1h
       │
       └─ for each pending row:
            status = fetchPayHereStatus(row.reference)
              throws → skip, count as still_pending
              404'd by PayHere AND row >24h old → flip to 'failed' (abandoned)
            db.transaction:
              <same logic as webhook handler, minus signature check>
       │
       └─ return JSON { processed, succeeded, failed, still_pending }
```

### 4.4 Stacking math

```ts
computeNextMembershipWindow({
  today: '2026-05-16',
  durationDays: 30,
  latestActiveEndDate: '2026-06-01'
})
// → { startDate: '2026-06-02', endDate: '2026-07-01' }

computeNextMembershipWindow({
  today: '2026-05-16',
  durationDays: 30,
  latestActiveEndDate: null
})
// → { startDate: '2026-05-16', endDate: '2026-06-14' }

computeNextMembershipWindow({
  today: '2026-05-16',
  durationDays: 30,
  latestActiveEndDate: '2026-04-01'   // already expired
})
// → { startDate: '2026-05-16', endDate: '2026-06-14' }
```

Pure function; lives in `src/lib/memberships/next-window.ts`. Not folded into
Phase 1's `computeMembershipWindow` — they have different invariants and
testing one shouldn't risk regressing the other.

### 4.5 Refunds

Reuse Phase 2's `_refundPaymentUnsafe` as-is. Admin processes the refund in
PayHere's merchant dashboard, then clicks Refund in our admin UI. A negative
`refunded` row is written; `computeOutstanding` already nets it. No code
changes for refunds in Phase 4.

---

## 5. Error handling

| Failure                                                          | Handling                                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signature mismatch                                       | 401. PayHere retries with backoff. Logged.                                                                                              |
| Webhook for unknown `order_id`                                   | 200 `{ reason: 'row_not_found' }`. Logged loudly. No retry wanted.                                                                      |
| Webhook delivered twice                                          | `FOR UPDATE` serializes; second sees `succeeded`. 200 `{ outcome: 'already_processed' }`.                                               |
| Webhook says success but `payhere_amount` ≠ row's `amountLkr`    | 200 `{ reason: 'amount_mismatch' }`. Row stays `pending`. Logged loudly.                                                                |
| Webhook says fail/cancel/chargeback (status_code -1/-2/-3)       | Flip row to `failed`. 200. No membership created.                                                                                       |
| DB transaction fails mid-way                                     | 500. PayHere retries. Transaction rolled back, no partial state.                                                                        |
| Webhook never arrives                                            | Reconciliation cron picks up after 1h, calls PayHere status API.                                                                        |
| Reconciliation: PayHere API down                                 | `fetchPayHereStatus` throws. Skip that row, continue. Count as `still_pending`. Next run retries.                                       |
| Reconciliation: PayHere has no record of `order_id`              | If row age >24h, flip to `failed` (abandoned checkout). Otherwise leave pending.                                                        |
| User abandons checkout before reaching PayHere                   | Pending row exists, no webhook. Eventually flipped by reconciliation's "no record" branch.                                              |
| User double-clicks "Pay"                                         | Two pending rows with different `reference`s. Browser navigates to the second redirect; first row gets abandoned and reconciled.        |
| Member marked `inactive` between checkout and webhook            | Webhook still creates the membership. Edge case — acceptable; admin would only mark inactive on a member known to have no pending pay.  |
| Plan deactivated between checkout and webhook                    | We use the stored `payments.plan_id` and read its `duration_days` regardless of `is_active`. Snapshotted amount is on the row already.   |
| Worker timeout (CF 30s wall) during webhook                      | Worker dies. PayHere retries. Lock + partial-unique index keep state consistent on retry.                                               |
| `CRON_SECRET` not set                                            | Endpoint 500s before doing any work. Logged.                                                                                            |
| MD5 formatting drift on `payhere_amount`                         | Spec mandates 2-decimal format. Pure-logic tests cover `"1500"` vs `"1500.00"` comparisons.                                             |

---

## 6. Environment variables

Added this phase:

```
# PayHere
PAYHERE_MERCHANT_ID
PAYHERE_MERCHANT_SECRET
PAYHERE_MODE             # 'sandbox' | 'live'
PAYHERE_NOTIFY_URL       # https://<tunnel>.trycloudflare.com/api/payments/payhere/webhook (dev)

# App
CRON_SECRET              # bearer for reconciliation endpoint (already in design doc)
APP_URL                  # https://muscle-factory-gym.kha-akashanadeel.workers.dev for return/cancel URLs
```

Setup is a config-not-code task at the end of implementation.

---

## 7. Testing

### 7.1 Pure logic (vitest unit-style)

`tests/lib/payhere-sign.test.ts`
- `buildCheckoutFields`: hash matches hand-computed MD5 for fixed inputs
- amount formatted as `"1500.00"`, currency always `"LKR"`
- `verifyWebhookSignature`: valid passes, tampered fails, missing md5sig fails

`tests/lib/payhere-reference.test.ts`
- shape: `gym_<uuid>`
- two calls return different values

`tests/lib/memberships-next-window.test.ts`
- no prior membership → starts today
- prior ends in future → starts day after
- prior already expired → starts today
- prior ends exactly today → starts tomorrow
- 1-day plan stacking → start === end

### 7.2 DB integration

`tests/lib/payhere-checkout.integration.test.ts` — `_createCheckoutUnsafe`
- happy path: pending row inserted with correct fields; hash in returned fields matches
- inactive plan: rejects, no row inserted
- inactive/pending member: rejects, no row inserted

`tests/lib/payhere-process.integration.test.ts` — `_processWebhookUnsafe`
- success: pending → succeeded, membership inserted, `payments.membership_id` updated
- success with no prior membership → window starts today
- success with prior active membership ending in 5 days → window starts 6 days from today
- duplicate success (same reference, second call) → `already_processed`
- status_code in {-1,-2,-3} → failed, no membership
- amount_mismatch → returns mismatch, row stays pending
- row_not_found → clean return, no DB write
- plan deactivated between checkout and webhook → still succeeds

`tests/lib/payhere-reconcile.integration.test.ts` — `_reconcilePendingUnsafe`
  with injected `fetchPayHereStatus`
- 3 pending rows: success/failed/pending → outcomes match
- rows <1h old not picked up
- fetcher throws on one row → still_pending counted, others processed
- 24h-old pending with "no record" → flipped to failed

### 7.3 Route handlers

- webhook route: 401 on signature fail, 200 on row_not_found, 200 on success (state verified), 200 on already_processed
- checkout route: 401 without Clerk session, 400 on missing/invalid planId, 200 with auto-post HTML containing the correct hash
- reconcile route: 401 without bearer, 401 on wrong bearer, 200 with summary on correct bearer
- status route: 401 without session, 403 cross-member, 200 for owner

### 7.4 Local E2E walkthrough (manual)

1. PayHere sandbox merchant account configured.
2. `npm run dev` + `cloudflared tunnel --url http://localhost:3000`; copy URL into PayHere sandbox dashboard's notify_url + return_url.
3. POST to `/api/payments/payhere/checkout` with a session cookie (or temporary "Pay test plan" button).
4. PayHere sandbox card `4916217501611292` (Visa success).
5. Verify: row flips to succeeded, membership row appears, confirm page polls green.
6. Sandbox card `4929119799365646` (Visa fail) → row flips to failed.
7. Reconciliation walkthrough: start checkout, kill `cloudflared` mid-flow, set `paid_at` back manually, curl reconcile endpoint, verify flip.

### 7.5 Coverage target

130 existing tests pass + ~25–30 new ones, ending around 155–160 tests across
28–30 files.

---

## 8. Done criteria

1. All new unit + integration tests pass; existing 130 still pass.
2. `npm run build` green.
3. Local E2E (§7.4) completed end-to-end: sandbox success creates membership;
   sandbox fail does not; reconciliation flips a manually-stuck pending row.
4. Tag `phase-4` at the green HEAD.

Production deploy (real PayHere sandbox round-trip from the live URL) remains
gated on the OpenNext/CF deploy gap. Phase 4 ships code-and-local-E2E complete,
same posture as Phases 1–3.

---

## 9. What's deferred to a follow-up

- Checkout UI surface (member portal renewal button, admin "Pay online" CTA on member detail).
- Cron scheduling (`triggers.crons` in `wrangler.jsonc`) — folded into Phase 5.
- PayHere refund API integration (currently bookkeeping-only).
- Receipt emails on payment success (folded into Phase 5 with Resend).
- Live-mode flip (PAYHERE_MODE='live', real merchant credentials, domain) — a
  customer-paperwork task, not a code task.
