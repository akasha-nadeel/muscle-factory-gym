# Gym Management System — Design

**Date:** 2026-05-14
**Status:** Approved (brainstorming phase complete; implementation plan to follow)

---

## 1. Context & goals

A single-gym management web app for a gym in Sri Lanka. Built and operated by the gym owner. Replaces ad-hoc spreadsheets / notebooks for three pain points the owner identified:

1. **Member & membership tracking** — who is a member, what plan, when it expires.
2. **Payments & dues collection** — who paid, who owes, cash and online.
3. **Attendance & access control** — check-in at the front desk.

Class scheduling, trainer assignments, equipment, and multi-location are explicitly **out of scope** for now.

**Users:**
- **Admin** (the owner) — full access via the dashboard.
- **Members** — self-service portal: see plan, dues, attendance, QR code.
- No staff/trainer roles in MVP.

**Region:** Sri Lanka. Currency: LKR. Online payment gateway: **PayHere**.

**Scale assumption:** sized for 200–500 active members to start.

---

## 2. Architecture

One **Next.js 15** application (App Router), deployed to **Cloudflare Pages** via the **OpenNext Cloudflare** adapter. Route groups split the surface area:

- `(auth)/...` — Clerk-hosted sign-in / sign-up / reset (public).
- `(admin)/...` — admin dashboard (role-gated).
- `(member)/...` — member portal (role-gated).
- `api/...` — route handlers for: PayHere webhook, Clerk webhook, QR check-in, cron triggers, server actions.

**Data & services:**
- **Supabase Postgres** for the database, accessed server-side via **Drizzle ORM** using a Cloudflare-Workers-compatible driver.
- **Supabase Storage** for member photos.
- **Clerk** for authentication (email + password, magic link, optional Google). Role stored in Clerk `publicMetadata.role`; a `clerk_user_id` foreign key links every domain row to a Clerk user.
- **PayHere** for online card / wallet payments (hosted checkout + webhook).
- **Resend** for transactional email (reminders).
- **Cloudflare Cron Triggers** for nightly jobs.

**UI:** Tailwind CSS + shadcn/ui. One design system across both UIs; navigation is role-aware.

**Why this shape:** single app keeps deploy/shared-code simple; route groups keep the two audiences distinct without splitting projects; Drizzle gives end-to-end types; Clerk + Supabase removes the most brittle parts of a self-built auth + DB layer.

**Hosting cost target:** $0 — Cloudflare Pages free, Supabase free tier, Clerk free tier (10K MAU), Resend free tier (3K emails/mo). PayHere takes a per-transaction percentage only; no monthly fee.

---

## 3. Data model

Six tables. All primary keys are `uuid`. All tables carry `created_at`; mutable tables also carry `updated_at`.

### `profiles`
Mirror of Clerk users so we can join locally.
- `id` (pk)
- `clerk_user_id` (unique, indexed)
- `role` — `'admin' | 'member'`
- `status` — `'pending' | 'active' | 'inactive'`
- `full_name`, `email`, `phone`, `photo_url`

### `plans`
Editable list of plan types.
- `id` (pk)
- `name` — e.g., `'Daily Pass'`, `'Monthly'`, `'Annual'`
- `duration_days` — 1, 30, 365 (or any custom)
- `price_lkr` (numeric)
- `is_active` (bool) — soft-disable retired plans

Seeded with daily / monthly / annual; admin can add/edit.

### `memberships`
Each purchase of a plan = one row. A member has many across their lifetime.
- `id` (pk)
- `member_id` → `profiles.id`
- `plan_id` → `plans.id`
- `start_date`, `end_date`
- `status` — `'active' | 'expired' | 'cancelled'`
- `created_by` → `profiles.id` (admin who created it)
- Reminder bookkeeping: `reminder_3d_sent_at`, `reminder_1d_sent_at`, `last_overdue_reminder_at` (timestamps; null until sent)

"Current" membership = row with `status='active'` and `end_date >= today`.

### `payments`
Every payment received.
- `id` (pk)
- `membership_id` → `memberships.id` (nullable for ad-hoc)
- `member_id` → `profiles.id` (denormalized)
- `amount_lkr` (numeric; refunds stored as negative)
- `method` — `'cash' | 'bank_transfer' | 'payhere'`
- `status` — `'pending' | 'succeeded' | 'failed' | 'refunded'`
- `reference` — receipt # or PayHere `payment_id`
- `paid_at`
- `recorded_by` → `profiles.id` (admin who logged it; null for PayHere)
- `notes`

### `attendance`
One row per check-in.
- `id` (pk)
- `member_id` → `profiles.id`
- `membership_id` → `memberships.id` (which membership covered the visit)
- `checked_in_at`
- `checked_in_by` → `profiles.id` (admin who scanned; null if self-scanned)
- `source` — `'qr_scan' | 'manual'`

No check-out time. Unique constraint on (`member_id`, `date(checked_in_at)`) to prevent same-day duplicates.

### QR tokens — stateless, no table
Member's QR encodes a signed payload `{member_id, iat}` signed with `QR_SECRET` (HMAC-SHA256). To invalidate all outstanding QRs, rotate the secret. Tokens expire 24h after issue to force fresh display.

---

## 4. Core flows

### 4.1 Member self-signup → activation
1. Member opens `/sign-up` (Clerk hosted UI), provides email/password/name/phone.
2. Clerk creates the user, fires `user.created` webhook to `api/clerk/webhook`.
3. Webhook inserts `profiles` with `role='member'`, `status='pending'`. If email matches `ADMIN_EMAILS` env var, sets `role='admin'`, `status='active'`.
4. Member is redirected to portal → "awaiting approval" screen. No QR, no check-in.
5. Admin opens "Pending approvals" queue → picks plan → records first payment → atomic server action inserts `memberships` + `payments` rows and flips `profiles.status='active'`.

### 4.2 Manual payment (cash / bank transfer)
1. Admin opens member detail → "Record payment".
2. Form: amount, method (`cash` | `bank_transfer`), optional reference, optional "extend membership" with plan picker.
3. Server action inserts `payments` row with `status='succeeded'`, `recorded_by=admin.id`. If extending, also inserts a new `memberships` row with `start_date = max(today, prev.end_date)` and `end_date = start + plan.duration_days`.

### 4.3 Online payment (PayHere)
1. Member (or admin) clicks "Pay online" for a selected plan.
2. Server action inserts `payments` row with `status='pending'`, `method='payhere'`, then builds a server-side MD5-signed PayHere checkout payload.
3. User is redirected to PayHere hosted checkout; completes payment.
4. PayHere posts to `api/payments/payhere/webhook`. Handler verifies the MD5 signature with `PAYHERE_MERCHANT_SECRET`; on success, flips the payment row to `'succeeded'` and creates the corresponding `memberships` row. Idempotent: re-delivery is a no-op.
5. Member is redirected to a "Payment confirmed" page that polls until the webhook lands (timeout → "we're confirming, refresh in a minute").
6. Nightly reconciliation cron retrieves any `pending` payment older than 1 hour from PayHere's API and updates status.

### 4.4 QR check-in
1. Member portal renders the member's QR (signed token, regenerated server-side per page load).
2. Admin check-in page opens the device camera (web `getUserMedia` + a QR scanner library).
3. Scanned token → POST to `api/checkin` → server verifies signature, ensures token age < 24h, looks up current membership.
4. Insert `attendance` row, return `{ ok, member_name, plan, expires_on, photo_url }`. UI shows a large green confirmation with the member's photo, or a red rejection with reason: `expired`, `pending_approval`, `inactive`, `already_checked_in_today`.
5. Manual fallback: admin searches by name/phone and clicks "Check in" — same endpoint, `source='manual'`.

### 4.5 Membership expiry & renewal
- Nightly cron `api/cron/expire-memberships`: flips `memberships` where `end_date < today AND status='active'` to `'expired'`.
- Members with no current membership see "Your membership expired on X — please renew" with a Pay-with-PayHere button.
- Renewal is always explicit; no auto-charging.

### 4.6 Daily payment reminders
Cron `api/cron/send-payment-reminders` runs daily.
- **3 days before expiry**: one-time reminder email; stamps `reminder_3d_sent_at`.
- **1 day before expiry**: one-time reminder; stamps `reminder_1d_sent_at`.
- **Day after expiry onwards**: daily reminder with PayHere link; updates `last_overdue_reminder_at`. Stops when member renews or is auto-inactivated.
- Channel: email only (Resend). SMS deferred.

### 4.7 Auto-inactivation
Cron `api/cron/inactivate-stale-members` runs daily.
- Rule: if a member has **no check-in in the last 180 days**, set `profiles.status='inactive'`.
- Inactive members:
  - Can still log in but see a "Reactivate at the front desk" screen.
  - Stop receiving reminder emails.
  - Admin can manually reactivate and assign a new plan.
- Soft delete only — payment and attendance history is preserved.

### 4.8 Refunds
Admin-only action. Recorded as a new `payments` row with negative `amount_lkr` and `status='refunded'`, linked to the original via `reference`. No automatic proration of memberships.

---

## 5. Auth & authorization

- **Clerk** handles sessions, password reset, email verification, and login rate-limiting.
- **Next.js middleware** runs on every route, redirecting unauthenticated users and enforcing role gates per route group.
- **Server actions / route handlers** double-check authorization. Member queries are always scoped: `WHERE member_id = currentUserProfileId`. Admin mutations call a `requireAdmin()` helper at the top.
- **Public endpoints** with custom auth:
  - PayHere webhook — verified via MD5 signature against `PAYHERE_MERCHANT_SECRET`.
  - Clerk webhook — verified via Svix signature against `CLERK_WEBHOOK_SECRET`.
  - Cron endpoints — verified via `Authorization: Bearer <CRON_SECRET>` header set on the Cloudflare cron trigger.

---

## 6. Error handling

Cases we handle explicitly:

| Case | Handling |
|---|---|
| PayHere webhook never arrives | Reconciliation cron polls PayHere API for `pending` rows >1h old |
| PayHere webhook duplicated | Handler is idempotent on `payments.status` |
| QR token tampered | Signature mismatch → reject |
| QR token >24h old | Reject; member portal refreshes on every load |
| QR replay same day | Unique constraint + friendly "Already checked in at HH:MM" message |
| Expired membership at check-in | Reject with renewal CTA |
| Clerk webhook fails / out of order | Idempotent on `clerk_user_id`; nightly reconciliation job |
| Resend email bounces | No retry; next day's cron sends the next reminder. Hard bounces visible in Resend dashboard |
| DB constraint failures | Caught at server action; surfaced as field-specific toast |

Explicitly **not built**: retry queues (cron reconciliation is sufficient), custom email template engine (React Email + a handful of templates), audit log table (timestamps + history rows are enough for now).

---

## 7. Testing

- **Vitest** for pure logic: QR sign/verify, membership end-date math, reminder-eligibility, PayHere signature verification.
- **Drizzle + local Postgres in Docker** for atomic flows: approve member, record payment, expire-memberships cron, auto-inactivate cron.
- **Playwright** for three critical happy paths: member signup → approval → first QR check-in; admin records cash payment; PayHere sandbox round-trip with mocked webhook.
- **Manual QA checklist** in the repo for: camera access on various devices, PayHere live sandbox, email rendering across clients.

Deferred: visual regression, load testing, exhaustive E2E coverage.

---

## 8. Build plan (phased MVP)

Each phase is end-to-end usable before starting the next.

**Phase 0 — Foundation (1–2 days)**
Next.js + Tailwind + shadcn/ui scaffold. Clerk wired up with `ADMIN_EMAILS` auto-promotion. Supabase project + Drizzle schema + migrations for all six tables. Cloudflare Pages deploy working via OpenNext. *Done when:* sign-in works on a live URL.

**Phase 1 — Members & plans (1–2 days)**
Admin: plans CRUD, member list, member detail, pending-approval queue. Member self-signup via Clerk + webhook → pending profile. Member portal: pending-state screen + profile page. *Done when:* a member can sign up, be approved, and shows as active.

**Phase 2 — Payments (manual first) (1–2 days)**
Admin record-payment with extend-membership toggle. Member portal: dues / payment history. Reports: monthly revenue, by-method breakdown. *Done when:* you can run the gym on cash alone and trust the numbers.

**Phase 3 — QR check-in (1 day)**
Server-side QR generation. Member portal shows QR. Admin scanner page with camera + manual fallback. Attendance history per member. *Done when:* front-desk check-in works end-to-end.

**Phase 4 — Online payments (PayHere) (1–2 days)**
PayHere sandbox integration. Checkout from portal and admin. Idempotent + signature-verified webhook. Reconciliation cron. *Done when:* sandbox payment flows through and membership is auto-created.

**Phase 5 — Reminders & auto-inactivation (1 day)**
Resend + React Email templates. Two cron jobs (reminders, inactivation). *Done when:* an expired member gets reminders and someone unseen 180 days goes inactive automatically.

**Deferred (post-MVP):** SMS, class scheduling, trainer accounts, equipment tracking, body measurements, audit log table, advanced reports / CSV export, multi-location, native mobile apps.

---

## 9. Environment variables (target list)

```
# Clerk
CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
ADMIN_EMAILS              # comma-separated; auto-promoted to admin on signup

# Supabase / DB
DATABASE_URL              # pooled connection string for runtime
DIRECT_DATABASE_URL       # direct connection for migrations
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY # server-only (Storage uploads)

# PayHere
PAYHERE_MERCHANT_ID
PAYHERE_MERCHANT_SECRET
PAYHERE_MODE              # 'sandbox' | 'live'

# Resend
RESEND_API_KEY
EMAIL_FROM                # e.g., 'noreply@yourgym.lk'

# App
QR_SECRET                 # HMAC secret for QR tokens
CRON_SECRET               # bearer token for cron endpoints
APP_URL                   # public URL for emails/callbacks
```

---

## 10. Open questions / future decisions

- **Domain & email sending domain** — needs to be acquired before live PayHere + Resend. Not blocking development.
- **Member photo** — required at signup or optional? Currently optional.
- **Multi-day passes (e.g., 10-visit pack)** — not in MVP; would need a `visits_remaining` column on `memberships`.
- **Family / shared plans** — not in MVP.
- **Tax / GST on invoices** — not in MVP; payments are receipt-style only.

---

*Next step: invoke the writing-plans skill to produce a detailed implementation plan derived from this design.*
