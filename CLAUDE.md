# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Single-gym management web app for a gym in Sri Lanka (currency LKR, timezone Asia/Colombo). One Next.js 15 App Router application serving two role-gated audiences — an **admin** dashboard (the owner) and a **member** portal — plus public auth, a check-in kiosk, and webhook/cron API routes. Live on Vercel as an installable PWA. Out of scope: class scheduling, trainers, equipment, multi-location.

## Commands

```bash
npm run dev            # next dev --turbopack
npm run build          # runs prebuild migrate-deploy.ts, then next build
npm run lint           # eslint
npm test               # vitest run (one-shot)
npm run test:watch     # vitest watch
npx vitest run tests/lib/tz.test.ts            # single test file
npx vitest run -t "name of test"               # single test by name

npm run db:generate    # drizzle-kit generate — create SQL migration from schema.ts
npm run db:migrate     # drizzle-kit migrate
npm run db:push        # drizzle-kit push (dev only)
npm run db:studio      # drizzle-kit studio
npm run db:seed        # tsx src/db/seed.ts
```

**Migrations are applied by a custom idempotent runner, not `drizzle-kit migrate`.** `scripts/migrate-deploy.ts` runs automatically as the `prebuild` step before every `next build` (local and Vercel). It maintains its own `_app_migrations` ledger, backfills the ledger on first run against a pre-existing DB (dev had 0000–0008 applied, prod 0000–0006), and splits each `drizzle/*.sql` file on `--> statement-breakpoint`. To add a schema change: edit `src/db/schema.ts`, run `db:generate`, commit the generated `drizzle/*.sql`, and it ships on next deploy.

## Architecture

### Routing & roles
- `src/app/(auth)/...` — Clerk-hosted sign-in/sign-up (public).
- `src/app/admin/...` — admin dashboard (members, plans, payments, pending approvals, outstanding dues, reports). Role-gated.
- `src/app/portal/...` — member self-service portal. Role-gated.
- `src/app/checkin/...` — front-desk kiosk + QR scan landing.
- `src/app/api/...` — route handlers: `clerk/webhook`, `checkin/scan`, `cron/*`, `admin/*`.

### Auth — three-layer role enforcement (`src/lib/auth.ts`, `src/middleware.ts`)
Clerk is the identity provider; `profiles` mirrors Clerk users so domain rows can join locally. Role lives in Clerk `publicMetadata.role` and is surfaced via the session-token claim `sessionClaims.metadata.role` (requires a configured Clerk session-token template — see memory).

1. **`middleware.ts`** redirects based on the JWT claim, but **only when the claim positively disagrees**. A *missing* role (stale JWT right after sign-in) is let through to avoid a redirect loop — the layer below resolves it from the DB.
2. **`getCurrentUser()`** trusts the claim if present, else falls back to a DB lookup (wrapped in try/catch so a transient DB error degrades to `member`, not a crash).
3. **`requireAdminProfile()` / `requireMemberProfile()`** are for mutations: they re-check role AND return the profile row (for `createdBy`/`recordedBy` audit columns). The **DB row is authoritative** — if it says member while the claim said admin, the user is redirected. These self-heal a missing profile via `_syncFromLiveClerkSession`.

A user is an admin iff their email is in the `ADMIN_EMAILS` env CSV — `decideRoleAndStatus` (`src/lib/role-decision.ts`) is the single source of that rule, applied on Clerk-webhook upsert. Non-admins sign up as `status: 'pending'` and must be approved in `/admin/pending`.

### Database (`src/db/`)
Supabase Postgres via Drizzle (`drizzle-orm/postgres-js`). **`prepare: false` is mandatory** — `DATABASE_URL` points at Supabase's pgbouncer transaction pooler (port 6543, IPv4) which rejects prepared statements; the IPv6 direct host isn't routable from Vercel build runners or Sri Lankan ISPs. `DIRECT_DATABASE_URL` is used only by `drizzle.config.ts` (local generate/studio).

Tables (`src/db/schema.ts`): `profiles`, `plans`, `memberships`, `payments`, `attendance`, `workout_plans`. Notable invariants encoded there:
- Payments `reference` is unique **only for `status='succeeded'`** (partial index) — refunds intentionally reuse the original reference, and this is the PayHere webhook idempotency key. A second partial index makes a `status='refunded'` row unique per `reference` too (one refund per original).
- Payments carry a `kind` (`payment_kind` enum: `membership` | `admission`). The one-time **admission fee is enforced at most once per member** via a partial unique index on `member_id WHERE kind='admission' AND status='succeeded'`.
- **One-check-in-per-day is enforced in app code at scan time, NOT in the DB** — Postgres can't index `date(checked_in_at)` on a timestamptz (not IMMUTABLE).
- `workout_plans` has a unique index on `member_id` (latest-only; new uploads upsert and delete the old Supabase file).
- "Current" membership = `status='active' AND end_date >= today` (`src/lib/memberships/current.ts`).

### Business logic lives in `src/lib/`, pure and tested
Date math, membership windows, dues/outstanding calculation, reminder decisions, check-in evaluation, and QR signing are pure functions in `src/lib/**` with colocated tests in `tests/lib/**`. Route handlers and server actions are thin shells over them. **When changing a rule, change the lib function and its test — not the call site.**

### Timezone — never use the runtime's local time (`src/lib/tz.ts`)
The gym is UTC+5:30 with no DST. All "today"/date-bucketing goes through `todayInSL()`, `formatSLDate*()`, `slDateToUTC()`, etc., which compute Sri Lanka local time regardless of server TZ (works identically on Windows dev in SLT and Vercel in UTC). Do not call `new Date().toISOString().slice(0,10)` or rely on `Date` locale methods for business dates.

### QR check-in (`src/lib/qr/token.ts`, `src/app/checkin/`)
Kiosk QR is **stateless** — token format `kioskId.iat.sig` signed HMAC-SHA256 with `QR_SECRET` (uses Web Crypto `crypto.subtle`, edge-compatible). No DB row; rotating `QR_SECRET` invalidates all outstanding tokens. Tokens carry a max-age + 60s clock-skew grace. `/checkin/scan` is in the member-route matcher so a fresh phone gets a one-time Clerk sign-in (preserving `?t=`) then auto-checks-in. A pending member who scans before approval gets `pending_qr_scan_at` stamped, and approval auto-inserts the attendance row.

### Cron (`vercel.json` → `src/app/api/cron/*`)
Three **scheduled** nightly jobs, all Bearer-authed with `CRON_SECRET`, all GET-aliased-to-POST (Vercel cron invokes via GET): `expire-memberships` (18:30 SLT), `expire-workout-plans` (18:45), `inactivate-stale-members` (19:00). **Vercel Hobby tier is daily-only** — hourly schedules fail at deploy. Logic lives in `src/lib/cron/*`; routes are auth shells.

A fourth route exists — `send-reminders` (`src/app/api/cron/send-reminders`, `src/lib/cron/send-reminders.tsx`) — but it is **not in `vercel.json` and is not chained from another job, so it currently never runs on a schedule**. Wire it into `vercel.json` (or trigger it manually) to enable the email reminders described below.

### Email (`src/lib/email/`)
React Email templates rendered to HTML, sent via Resend (`RESEND_API_KEY`, `EMAIL_FROM`). The `send-reminders` cron (see the caveat in **Cron** — currently unscheduled) decides per-membership which reminder (3-day / 1-day / overdue) to send using `decide-reminder.ts`, recording sent-timestamps on the membership row to avoid duplicates. `mailer.ts` is an interface so tests inject a fake.

### Storage
Member photos and workout-plan PDFs in Supabase Storage via the service-role key (`src/lib/storage/supabase-storage.ts`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

### Testing (`vitest.config.ts`, `tests/setup.ts`)
`tests/lib/**` are mostly pure-function unit tests, but a large share of the suite (`tests/db/**`, `tests/app/admin/**`, `tests/app/api/**`, `tests/api/**`, and the cron tests) **hits a live remote Postgres and writes to it**. Consequences to know before running or adding tests:
- **⚠️ `DATABASE_URL` in `.env.local` MUST be a dedicated dev/test database — NEVER production.** Cleanup for most tests is fixture-scoped, but the cron tests are not: `tests/lib/cron-wipe.test.ts` runs `_wipeStaleMembersUnsafe` (a table-wide PII wipe that also deletes Supabase Storage files) and `tests/lib/cron-expire.test.ts` / `inactivate` run table-wide `UPDATE`s against whatever DB is connected — not limited to rows the test created. Running the suite against prod can irreversibly destroy real member data, and every wipe-test run burns numbers off the shared `gym_id_seq`. There is no built-in guard yet; a `DATABASE_URL`-check in `tests/setup.ts` is the recommended safety net.
- **`npm test` needs `.env.local` with a reachable `DATABASE_URL`** — `tests/setup.ts` loads it via dotenv; there is no local/in-memory DB. Tests will fail (not skip) without a working connection.
- **`fileParallelism: false`** — files run sequentially on purpose because they share one DB (e.g. the `profiles.gym_id` UNIQUE constraint races under parallel writes). Don't re-enable parallelism; write DB tests to clean up after themselves.
- `hookTimeout`/`testTimeout` are bumped to 30s to absorb Supabase pooler latency from local dev.
- Environment is **`node`, not jsdom** — even the `.tsx` component/email-template tests. An `oxc.jsx` override compiles JSX to real JS (tsconfig's `jsx: "preserve"` is for Next.js only). The `@` → `src` path alias is mirrored in `resolve.alias`.

## UI conventions
shadcn/ui (`components.json`, style `base-nova`, base color neutral) on Tailwind v4 (CSS-first, `@tailwindcss/postcss`; no `tailwind.config`). Primitives from `@base-ui/react`, icons from `lucide-react`, toasts via `sonner`, charts via `recharts`. Admin is dark-forced (`_force-dark.tsx`). PWA icons are generated at request time via `next/og` ImageResponse (`src/app/icons/[size]/route.tsx`) — there are no static PNG icons, and the service worker is intentionally no-cache. Don't break these patterns.

For shadcn Button-as-link, use `render={<Link/>}` (not `asChild` or an external `<Link>` wrap) — this Button forwards via a `render` prop.

## Environment variables
DB: `DATABASE_URL` (pooler, runtime), `DIRECT_DATABASE_URL` (direct, local tooling). Auth: Clerk publishable/secret keys, `CLERK_WEBHOOK_SECRET`, `ADMIN_EMAILS`, the `NEXT_PUBLIC_CLERK_*_REDIRECT_URL` set. Jobs: `CRON_SECRET`, `APP_URL`. Check-in: `QR_SECRET`. Email: `RESEND_API_KEY`, `EMAIL_FROM`. Storage: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. PayHere (planned): `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, `PAYHERE_MODE`, `PAYHERE_NOTIFY_URL`.

## Phase docs
`docs/plans/*-design.md` and `docs/superpowers/plans/*` hold the per-phase design + implementation history (foundation → members → payments → QR → PayHere → cron → email → admin redesign). The design doc's "Cloudflare Pages" hosting section is **stale** — the app deploys to Vercel.
