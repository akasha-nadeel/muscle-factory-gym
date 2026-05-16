# Phase 5 — Cron Infrastructure & Lifecycle Automation

**Date:** 2026-05-16
**Status:** Approved (design phase; implementation plan to follow)
**Scope:** Cron infra + 2 new lifecycle automations + scheduling Phase 4's deferred PayHere reconcile. **No email / Resend work** — deferred to a later phase.

---

## 1. Context

The original design doc (`2026-05-14-gym-management-system-design.md` §4.5 / §4.6 / §4.7)
called for three daily crons: expire memberships, send payment reminders, auto-inactivate
stale members. Phase 4 added a fourth (reconcile PayHere) but left it
unscheduled — the bearer-guarded endpoint exists, the `triggers.crons` block in
`wrangler.jsonc` does not.

This phase fills two of the four boxes: **expire** and **inactivate**, plus the
scheduling glue for all three already-built crons. The **reminder** cron and the
Resend SDK setup are explicitly out of scope; they land in a follow-up.

User decisions locked in before brainstorming:

- No Resend, no email templates, no reminder cron this phase.
- All 3 active crons wired in `wrangler.jsonc` `triggers.crons`.
- Dispatcher wraps OpenNext's generated `.open-next/worker.js`, adds a `scheduled()`
  handler that internal-fetches the bearer-guarded `/api/cron/*` endpoints.
- Inactivation eligibility: `MAX(last_checkin, profile.created_at) < today - 180 days`
  (never-checked-in members are inactivated when their profile is >180 days old).
- Cron timing: expire at 00:00 SL (18:30 UTC), inactivate at 00:30 SL (19:00 UTC),
  reconcile-payhere hourly UTC.

---

## 2. Architecture

```
CF Cron Trigger (UTC schedule from wrangler.jsonc)
       │
       ▼
┌──────────────────────────────────────────────────┐
│  src/worker-with-scheduled.ts   (NEW wrapper)    │
│    • fetch: delegates to .open-next/worker.js    │
│    • scheduled: routes event.cron → URL path,    │
│                  internal-fetches via Bearer     │
│    • re-exports OpenNext durable objects         │
└──────────────────────────────────────────────────┘
       │ HTTP POST (Bearer ${CRON_SECRET})
       ▼
┌────────────────────────────────────────────────────────┐
│  /api/cron/expire-memberships    (NEW)                 │
│    → flips memberships(status='active' AND             │
│        end_date < todaySL) → 'expired'                 │
│                                                         │
│  /api/cron/inactivate-stale-members  (NEW)             │
│    → flips profiles(status='active' AND role='member'  │
│        AND MAX(last_checkin, created_at)               │
│        < todaySL - 180 days) → 'inactive'              │
│                                                         │
│  /api/cron/reconcile-payhere   (existed since Phase 4) │
└────────────────────────────────────────────────────────┘
       │
       ▼ each helper returns { flipped: N } or
         the Phase-4 ReconcileSummary
```

All three endpoints share the same shape: bearer-guarded POST →
`_*Unsafe` helper → JSON summary response.

### 2.1 HTTP entry points

| Path | Purpose | Auth |
|---|---|---|
| `POST /api/cron/expire-memberships` | Flip overdue active memberships to expired. | `Authorization: Bearer ${CRON_SECRET}`. |
| `POST /api/cron/inactivate-stale-members` | Flip profiles whose effective last activity is >180 days old. | Same. |
| `POST /api/cron/reconcile-payhere` | (Phase 4) Sweep stuck pending PayHere rows. | Same. |

### 2.2 New worker entry

`src/worker-with-scheduled.ts` is a thin wrapper that:
- Imports the OpenNext-generated worker and re-exports its durable objects
  (`DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge`).
- Exposes `fetch` as a pass-through.
- Adds `scheduled(event, env, ctx)` that maps `event.cron` strings to URL paths
  and fires `ctx.waitUntil(fetch(...))` with the bearer header.

`wrangler.jsonc` `main` flips from `.open-next/worker.js` to this wrapper.

### 2.3 No new tables

All state lives on existing `memberships.status` and `profiles.status` columns.
Both enums already include the target values (`expired`, `inactive`). No
migration this phase.

---

## 3. File layout

```
src/
  lib/cron/
    expire.ts                              (NEW: _expireStaleMembershipsUnsafe)
    inactivate.ts                          (NEW: _inactivateStaleMembersUnsafe)
  app/api/cron/
    expire-memberships/route.ts            (NEW: thin shell)
    inactivate-stale-members/route.ts      (NEW: thin shell)
    reconcile-payhere/route.ts             (unchanged, Phase 4)
  worker-with-scheduled.ts                 (NEW: dispatcher)

wrangler.jsonc                             (MODIFY: main, triggers.crons, vars)

tests/
  lib/
    cron-expire.test.ts                    (NEW, 3 integration tests)
    cron-inactivate.test.ts                (NEW, 5 integration tests)
  app/api/
    cron-expire-route.test.ts              (NEW, 3 route tests)
    cron-inactivate-route.test.ts          (NEW, 3 route tests)
  worker/
    scheduled-dispatcher.test.ts           (NEW, 3 dispatcher tests with mocked fetch)
```

No new dependencies; no schema migration.

---

## 4. Data flow

### 4.1 Expire (00:00 SL daily)

```
CF cron fires "30 18 * * *"
   │
   ▼
worker-with-scheduled.scheduled(event)
   ROUTES["30 18 * * *"] = "/api/cron/expire-memberships"
   ctx.waitUntil(fetch(`https://${WORKER_HOSTNAME}${path}`, { ... Bearer }))
   │
   ▼
route handler: env-check → bearer-check → call helper
   │
   ▼
_expireStaleMembershipsUnsafe({ todaySL })
   │
   ▼
UPDATE memberships
   SET status = 'expired'
   WHERE status = 'active'
     AND end_date < $todaySL
   RETURNING id
   │
   ▼
return { flipped: N }  →  HTTP 200 { flipped: N }
```

**Idempotency.** Re-running tomorrow on yesterday's rows is a no-op:
they're now `status='expired'`, so the `WHERE status='active'` predicate skips them.

### 4.2 Inactivate (00:30 SL daily)

```
CF cron fires "0 19 * * *"
   │
   ▼
worker-with-scheduled → /api/cron/inactivate-stale-members
   │
   ▼
_inactivateStaleMembersUnsafe({ todaySL })
   │
   ▼
UPDATE profiles
   SET status = 'inactive'
   WHERE status = 'active'
     AND role = 'member'
     AND id IN (
       SELECT p.id
       FROM profiles p
       LEFT JOIN attendance a ON a.member_id = p.id
       WHERE p.status = 'active' AND p.role = 'member'
       GROUP BY p.id
       HAVING GREATEST(
                COALESCE(MAX(a.checked_in_at)::date, '1900-01-01'),
                p.created_at::date
              ) < ($todaySL::date - INTERVAL '180 days')
     )
   RETURNING id
   │
   ▼
return { flipped: N }  →  HTTP 200 { flipped: N }
```

**Three invariants:**
1. `role = 'member'` — admin profiles are never flipped.
2. `COALESCE(MAX(a.checked_in_at), '1900-01-01')` makes never-checked-in members
   fall back to their `created_at`, which is what the agreed rule requires.
3. Profile rows are never deleted. Only `status` flips. Attendance, payments,
   memberships history all preserved (design §4.7 soft-delete contract).

**Side effects on UI**: existing `/admin/members` filter respects `status`
already. Auto-inactivated members move out of "active" into "inactive" on the
admin tabs. Member portal already has an "inactive" branch
(`src/app/portal/page.tsx`) that says "Reactivate at the front desk".

### 4.3 Reconcile PayHere (hourly UTC)

Already implemented in Phase 4. No code change. The dispatcher adds the
`"0 * * * *"` entry to `ROUTES`, and `wrangler.jsonc` triggers it.

### 4.4 Cross-flow ordering

Expire (18:30 UTC) runs 30 min before inactivate (19:00 UTC). A member whose
membership expired at SL midnight gets their `memberships.status` flipped first.
If they've also been absent 180+ days, inactivate then flips their profile.
Independent state transitions on different tables — order doesn't matter for
correctness, but the chosen order matches the user-visible cause-and-effect.

---

## 5. Error handling

| Failure | Handling |
|---|---|
| `CRON_SECRET` not set | Route returns 500. Dispatcher logs the non-2xx. Cron is effectively a no-op until env is repaired. |
| Wrong/missing `Authorization` header | Route returns 401. Dispatcher logs `[scheduled] <cron> → 401`. |
| Unknown `event.cron` in dispatcher | `if (!path) return;` + `console.warn`. Defensive — only if `wrangler.jsonc` and `ROUTES` drift. |
| Dispatcher `fetch()` rejects (network blip) | `.catch()` logs warn. Next scheduled run picks up missed work. |
| Route returns 5xx | Dispatcher's `.then(r => !r.ok && console.warn(...))`. No retry — daily cron self-heals via idempotent predicate. |
| DB connection drop mid-UPDATE | Postgres rolls back. Helper throws. Route returns 500. Next day's run picks up combined backlog. |
| Empty result (nothing to flip) | `RETURNING id` yields zero rows. Helper returns `{ flipped: 0 }`. Not an error. |
| Concurrent run of same cron | Helpers are naturally idempotent on `status='active' AND ...`. Second run flips zero additional rows. |
| `WORKER_HOSTNAME` env missing | `fetch('https://undefined/...')` rejects. Logged. Cron does not run. Prevented at deploy time via `wrangler.jsonc vars`. |
| OpenNext re-export shape changes | Build error at `wrangler.jsonc` compile. Loud, fast failure. Detected on every `cf:build`. |
| `todayInSL()` clock drift | Out of scope. CF Workers clocks are sub-second accurate. |

### 5.1 Observability

Every scheduled dispatch produces zero log lines on success and one
`console.warn` on failure (unknown cron, route 4xx/5xx, or fetch reject). CF
Workers Observability tab surfaces these. No custom metrics surface.

---

## 6. Environment variables

No new secrets introduced. Existing `CRON_SECRET` (Phase 4) is reused. One new
non-secret build-time var:

```
WORKER_HOSTNAME=muscle-factory-gym.kha-akashanadeel.workers.dev
```

Set in `wrangler.jsonc` `vars`. On local `wrangler dev`, set to `localhost:8787`
or rely on a fallback.

---

## 7. Testing

### 7.1 DB integration (vitest with real Supabase)

`tests/lib/cron-expire.test.ts` — 3 tests:
- Active membership, end_date yesterday → flipped to expired.
- Active membership, end_date in the future → stays active.
- Already-expired membership → stays expired, not double-flipped.

`tests/lib/cron-inactivate.test.ts` — 5 tests:
- Member checked in 200 days ago → flipped to inactive.
- Member checked in 30 days ago → stays active.
- Member never checked in, created_at=today → stays active.
- Member never checked in, created_at=200 days ago → flipped to inactive.
- Admin profile, created_at=365 days ago, no check-ins → stays active.

Both use `phase5_test_*` clerk-id prefix conventions. Tests clean up before and
after each spec.

### 7.2 Route handlers

`tests/app/api/cron-expire-route.test.ts` — 3 tests: 401 no bearer, 401 wrong
bearer, 200 + JSON summary on correct bearer.

`tests/app/api/cron-inactivate-route.test.ts` — same 3-test shape.

Follow the Phase-4 `reconcile-route.test.ts` template exactly (set
`process.env.CRON_SECRET` per `beforeEach`, no Clerk mock since cron routes
don't use Clerk).

### 7.3 Dispatcher

`tests/worker/scheduled-dispatcher.test.ts` — 3 tests with `vi.stubGlobal('fetch', ...)`:
- Unknown cron string → fetch not called; `console.warn` captured.
- Known cron → fetch called once with the correct URL + bearer.
- Fetch returns 500 → `console.warn` captured; dispatcher does NOT throw.

The import of `.open-next/worker.js` is gated with `vi.mock` so tests pass
without a prior `npm run cf:build`.

### 7.4 Local E2E smoke (manual, optional)

`wrangler dev --test-scheduled` exposes a `/__scheduled?cron=...` URL that
triggers `scheduled()` with a fake event. Useful for verifying the dispatcher
in a real Workers runtime. Not gating Task 10's tag.

### 7.5 Coverage target

175 existing tests + ~14 new = ~189 across ~37 files.

---

## 8. Done criteria

1. New `cron-expire`, `cron-inactivate`, and dispatcher tests pass; existing 175 still pass.
2. `npm run build` green.
3. `npm run cf:build` green (proves `worker-with-scheduled.ts` resolves and
   re-exports succeed).
4. Tag `phase-5` at the green HEAD.

Production deploy + actual cron firing on the live worker continue to be gated
on the OpenNext/CF deploy gap. Phase 5 ships code-and-tests complete, same
posture as Phases 1–4.

---

## 9. What's deferred

- **Resend SDK + transactional email** (reminders, receipts, approval emails).
- **Reminder cron** (3-day/1-day/overdue) — depends on Resend.
- **PayHere receipt email** — also Resend-dependent.
- **Member approval email** — also Resend-dependent.
- **Live cron firing on production** — gated on the OpenNext deploy debugging.
- **Custom metrics surface for cron runs** — observability via CF logs only this phase.
