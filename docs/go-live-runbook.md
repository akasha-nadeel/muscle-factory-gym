# Go-Live Runbook — Muscle Factory Gym

How to take this app from the dev setup (your accounts, `musclefactory-gym.vercel.app`, Clerk DEV keys, your Supabase) to a client-ready production deployment on `musclefactorygym.lk` (canonical apex; `www.musclefactorygym.lk` 301-redirects to it).

**Launch scope:** no PayHere (cash / bank-transfer payments only), no Resend (transactional email off for now — see note below).

**Do the whole cutover in one sitting.** Once you flip `APP_URL` + live keys, the old `*.vercel.app` URL points at the wrong Clerk instance — don't leave it half-done.

> **Email is intentionally off.** The app sends welcome, workout-plan, and renewal-reminder emails through Resend, but every send is *best-effort and never throws* — with no `RESEND_API_KEY`/`EMAIL_FROM` set, those sends just log a warning and the app works normally. To turn email on later: verify a domain in Resend, set `RESEND_API_KEY` + `EMAIL_FROM`. **No code changes.**

---

## Ownership decision (do this first, on paper)

For each service, decide who owns the account. Recommendation:

| Service   | Owner (recommended)          | Why / notes |
|-----------|------------------------------|-------------|
| Domain    | **Client**                   | It's their brand. Register `musclefactorygym.lk` in their name. |
| Supabase  | **Client** (new account)     | Forced by free-tier 2-project limit anyway; their member data shouldn't live on your account. |
| Vercel    | **You now → transfer later** | Transfers cleanly via Team transfer. Don't rebuild on launch day. |
| Clerk     | **Client** (new account, invite you) | ⚠️ Clerk users are locked to the account+instance and **can't be migrated later** — decide before any real member signs up. Client creates the Clerk account, invites you as admin; you do all the technical setup logged in as yourself. |

**The recommended invite pattern (no PIN sharing):** for every client-owned service, the *client* creates the account with *their* email and verifies it once, then invites *your* email as a member/admin. You then log in as yourself and do all the work — you never need a verification code from them. This applies to **Supabase, Clerk, and the domain registrar.**

---

## Phase 0 — Prerequisites
- [ ] Client has purchased / authorized purchase of **`musclefactorygym.lk`**.
- [ ] You have access to the domain's **DNS panel** at the `.lk` registrar.
- [ ] Client's real **admin email** is known (goes in `ADMIN_EMAILS`).

> `.lk` DNS propagation can be slow. Do all DNS-record steps (Vercel, Clerk) as early as possible.

---

## Phase 1 — Supabase (new production database)

1. [ ] Create a new Supabase project under the **client's account**. Region: **Singapore** or **Mumbai** (closest to Sri Lanka).
2. [ ] Project Settings → Database → copy two connection strings:
   - **Pooler** URL, port **6543** → this becomes `DATABASE_URL` (runtime). *Mandatory* — the direct host is IPv6-only and unreachable from Vercel.
   - **Direct** URL → this becomes `DIRECT_DATABASE_URL` (local tooling only).
3. [ ] Project Settings → API → copy `Project URL` → `SUPABASE_URL`, and `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`.
4. [ ] Storage → **New bucket** named exactly **`workout-plans`**, with **"Public bucket" UNCHECKED** (must be private; members get signed URLs). Without this, workout-plan uploads throw.
5. [ ] Schema is created automatically on the first Vercel deploy — the `prebuild` runner (`scripts/migrate-deploy.ts`) detects the fresh DB and applies all migrations. No manual SQL.
6. [ ] After first deploy (or locally with the new URLs in `.env.local`): seed the default plans — `npm run db:seed` (idempotent; or skip and let the client create plans in `/admin/plans`).

---

## Phase 2 — Vercel (domain + env vars)

1. [ ] Project → Domains → add **`musclefactorygym.lk`** (+ `www` → redirect to apex). Set the A/CNAME records Vercel shows at the registrar.
2. [ ] Project → Settings → Environment Variables → set these for **Production**:

   **Database**
   - [ ] `DATABASE_URL` = pooler URL (6543)
   - [ ] `DIRECT_DATABASE_URL` = direct URL
   - [ ] `SUPABASE_URL`
   - [ ] `SUPABASE_SERVICE_ROLE_KEY`

   **App**
   - [ ] `APP_URL` = `https://musclefactorygym.lk` (drives QR scan URLs, kiosk)
   - [ ] `ADMIN_EMAILS` = client's admin email (comma-separated if more than one)
   - [ ] `QR_SECRET` = a fresh strong random string (rotating it invalidates kiosk QRs)
   - [ ] `CRON_SECRET` = a fresh strong random string

   **Clerk** (filled in Phase 3)
   - [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
   - [ ] `CLERK_SECRET_KEY` = `sk_live_…`
   - [ ] `CLERK_WEBHOOK_SECRET` = (new, from Phase 3)
   - [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` = `/portal`
   - [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` = `/portal`
   - [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` = `/portal`
   - [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` = `/portal`

   *(Not set now: `RESEND_API_KEY`, `EMAIL_FROM`, `PAYHERE_*` — see scope note at top.)*

> Generate secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

---

## Phase 3 — Clerk (DEV → PRODUCTION)

⚠️ **Clerk Production is a brand-new, empty instance with its own separate user database.** Dev users do NOT carry over. That's fine — you're pre-launch. But the client must sign up fresh on the live domain (see Phase 4).

> **Clerk is client-owned.** This whole application lives under the **client's** Clerk account.

0. [ ] **Client** signs up at `dashboard.clerk.com` with **their** email, then **invites your email** as an admin member of the workspace. (You do steps 1–6 logged in as yourself — no PINs needed.)
1. [ ] In Clerk, create the application + activate the **Production** instance for `musclefactorygym.lk`.
2. [ ] Add the **DNS records Clerk requires** at the registrar (CNAMEs for `clerk.`, `accounts.`, and the `clkmail`/DKIM records for Clerk auth emails).
3. [ ] **Re-create the session-token template** (Configure → Sessions → Customize session token):
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
   🔴 **Critical.** Without it, `sessionClaims.metadata.role` is empty and ALL admin/member gating breaks (`middleware.ts` + `lib/auth.ts`). It does **not** copy from the dev instance.
4. [ ] If using **Google sign-in**: production needs **your own Google Cloud OAuth client** (dev uses Clerk's shared creds). Create one, add the redirect URI Clerk shows (`https://clerk.musclefactorygym.lk/v1/oauth_callback`), paste client ID/secret into Clerk Production. Skip if not using Google.
5. [ ] Copy the **production keys** → `pk_live_…` and `sk_live_…` into Vercel (Phase 2).
6. [ ] **Re-create the webhook**: endpoint `https://musclefactorygym.lk/api/clerk/webhook`, subscribe to user events → copy the new **signing secret** → `CLERK_WEBHOOK_SECRET` in Vercel.

---

## Phase 4 — Deploy & verify

1. [ ] Redeploy on Vercel (or push to `main`). Watch the build log for the migration runner: should say **"Fresh DB detected … applying all migrations from scratch."**
2. [ ] `npm run db:seed` against the new DB if you didn't in Phase 1.
3. [ ] **Sign up as the client's admin email** on `https://musclefactorygym.lk` → confirm you land in **`/admin`** (proves session template + `ADMIN_EMAILS` + webhook all wired).
4. [ ] Sign up a throwaway member email → confirm `pending` → approve it from **`/admin/pending`**.
5. [ ] Open the kiosk (`/checkin`) on a desktop, scan the QR with a phone → confirm one-time sign-in + auto check-in.
6. [ ] Install the **PWA** from `musclefactorygym.lk` on a phone (Add to Home Screen).
7. [ ] Hit a cron route manually to confirm auth:
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://musclefactorygym.lk/api/cron/expire-memberships` → expect a JSON summary, not 401.

---

## Phase 5 — Handover

- [ ] Don't delete the dev Clerk instance / dev keys until production is verified for a few days.
- [ ] Transfer Vercel project → client's Vercel team (Settings → transfer) when ready.
- [ ] Transfer Clerk app ownership to client when ready.
- [ ] Hand over all account logins / confirm client has owner access to: domain, Supabase, Clerk, Vercel.
- [ ] Give the client a one-page "how to use" (approve pending members, record a payment, renew a membership, read the kiosk).

---

## Future (when the client wants them)

- **Email reminders** — the email code is fully built and live (it's just dormant without a key). Verify a domain in Resend, set `RESEND_API_KEY` + `EMAIL_FROM`. Turns on welcome / workout-plan / renewal-reminder emails. **No code changes.**
- **Online card payments (PayHere)** — ⚠️ NOT a config flip. PayHere was built then **removed from the codebase in Phase 9** (`src/lib/payhere/`, `src/app/api/payments/`, the reconcile cron, the receipt email — all deleted). Re-enabling means re-implementing the checkout + webhook + reconciliation flow, then adding production merchant creds. The `payment_method` enum still carries a `"payhere"` value and the old Phase 4 plan doc (`docs/superpowers/plans/2026-05-16-phase-4-payhere.md`) is the reference if it's ever revived. Treat as a feature project, not an env change.

---

## Quick reference — every env var needed for launch

| Var | Source | Changes for prod? |
|-----|--------|-------------------|
| `DATABASE_URL` | Supabase pooler (6543) | ✅ new project |
| `DIRECT_DATABASE_URL` | Supabase direct | ✅ new project |
| `SUPABASE_URL` | Supabase API | ✅ new project |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API | ✅ new project |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Production | ✅ `pk_live_` |
| `CLERK_SECRET_KEY` | Clerk Production | ✅ `sk_live_` |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook | ✅ new secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` | static | path, unchanged |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | static | path, unchanged |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | static | path, unchanged |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | static | path, unchanged |
| `ADMIN_EMAILS` | you set | ✅ client's email |
| `APP_URL` | you set | ✅ `https://musclefactorygym.lk` |
| `QR_SECRET` | you generate | ✅ fresh |
| `CRON_SECRET` | you generate | ✅ fresh |

*Not needed for this launch: `RESEND_API_KEY`, `EMAIL_FROM`, `PAYHERE_*`.*
