# Phase 3 — QR Check-in / Kiosk Design

**Date:** 2026-05-15
**Status:** Approved (brainstorming complete; implementation plan to follow)
**Supersedes:** Design doc §4.4 "QR check-in" — the original "admin scans member's phone" model is replaced with the kiosk model below.

---

## 1. Context

The gym owner runs a laptop near the front-desk entrance. Members walk up and mark their own attendance via a public web page on that laptop. Two input paths, both end in the same `attendance` row:

- **Today:** Type Gym ID → Submit.
- **Future (mobile app):** Scan the QR shown on the kiosk with the member's app → app POSTs `{kiosk_token, member_id}`.

Phase 3 ships the kiosk page, the Gym ID flow, the mobile-app endpoint (stubbed — no client yet), attendance history on both admin and member surfaces, and a new `gym_id` column on `profiles`.

Out of scope for Phase 3: the mobile app itself, admin scanner camera, manual search at the kiosk, anti-replay rate limiting on the public route, multi-kiosk support.

---

## 2. Data model changes

### `profiles.gym_id` (new column)
- `integer`, nullable, unique.
- Assigned at member approval time as `MAX(gym_id) + 1` (starts at 1000, capacity 9000).
- NULL for admins, pending members, and members who haven't been approved yet.
- Migration backfills any existing `status='active'` member rows in dev/test DBs (production has none).

### `attendance.source` (existing enum extended)
- Add value `'kiosk_id'` — used when attendance is recorded via the kiosk Gym ID form.
- Existing `'qr_scan'` reserved for the future mobile-app QR-scan path.
- Existing `'manual'` reserved for admin-driven override (future).

No new tables. Kiosk QR tokens stay stateless (HMAC); rotating the `QR_SECRET` env var invalidates all outstanding tokens.

---

## 3. Routes & files

| Path | Purpose |
|---|---|
| `/checkin` | **Public** kiosk page — Gym ID form + rotating QR placeholder |
| `/checkin` POST (server action) | Records attendance for a Gym ID |
| `/api/checkin/scan` POST | Mobile-app endpoint (stub in Phase 3): verifies kiosk HMAC + member identity, inserts attendance |
| `src/lib/qr/token.ts` | HMAC-SHA256 sign/verify using Web Crypto API (CF Workers compatible) |
| `src/lib/checkin/record.ts` | `_recordAttendanceUnsafe({memberId, source, now})` — eligibility checks + insert, returns `{ok, member}` or `{ok: false, reason}` |
| `src/lib/gym-id.ts` | `assignNextGymId(tx)` — picks the next free 1000–9999 inside an approval transaction |
| `src/app/checkin/page.tsx` | Kiosk page (Server Component, public — listed in `middleware.ts` public routes) |
| `src/app/checkin/_form.tsx` | Client Component: Gym ID input + submit + success/reject cards |
| `src/app/checkin/_kiosk-qr.tsx` | Client Component: renders the rotating QR via `qrcode` browser bundle |
| `src/app/admin/pending/actions.ts` | Modified: assign `gym_id` inside the existing approve transaction |
| `src/app/admin/members/[id]/page.tsx` | Add Attendance section (last 30 check-ins) |
| `src/app/admin/members/[id]/_attendance-table.tsx` | New component |
| `src/app/portal/page.tsx` | Add Attendance section (member's own last 30) + show member's Gym ID prominently |

---

## 4. Kiosk page flow

1. `/checkin` loads. Page renders the Gym ID form + a QR encoding a signed token `{kiosk_id: 'main', iat: <unix>}`. QR is rendered client-side via `qrcode` so the token is embedded in the HTML payload at render time.
2. Page refreshes the QR every **5 minutes** via a setInterval that re-fetches a fresh token from the server (Server Action that returns the HMAC-signed string). Max token age accepted by `/api/checkin/scan` is 24h.
3. Member types Gym ID → form posts via server action `submitGymId(gymId)`.
4. Server: `SELECT * FROM profiles WHERE gym_id = $1`. Run eligibility checks (see §5). If OK, insert `attendance` row with `source='kiosk_id'`, `checkedInAt=now`, `checkedInBy=null`.
5. Success → large green card for ~5s with member name, plan, expiry, days remaining, photo. Then form resets and refocuses input.
6. Reject → red card with clear reason text + "Try again" button.

Note: `/checkin` is added to the public-routes list in `src/middleware.ts` so unauthenticated visitors can load it.

---

## 5. Eligibility check (pure function, server-side)

Input: `{member: profileRow, currentMembership: rowOrNull, todayAttendance: rowOrNull, today: SLDate}`

Reject in this priority order:

| Reason | Trigger |
|---|---|
| `not_found` | No profile row found for the Gym ID |
| `pending_approval` | `profile.status='pending'` |
| `inactive` | `profile.status='inactive'` |
| `no_active_membership` | No membership with `status='active'` AND `end_date >= todaySL` |
| `already_checked_in_today` | Attendance row exists for this member with SL-local date == todaySL |

Otherwise success: `{ok: true, member: {fullName, planName, expiresOn, photoUrl, daysRemaining}}`.

`daysRemaining` = `endDate - todaySL` in calendar days (>=0).

---

## 6. Error handling

| Case | Handling |
|---|---|
| DB error during insert | Red card "Couldn't record — please try again. (E-DB)"; server-side console.error |
| Race: two rapid submits before insert | Re-query attendance after insert; if more than one row for today exists, return `already_checked_in_today` (the row stays — first one wins functionally) |
| Tampered kiosk QR (future) | HMAC signature mismatch → 401 from `/api/checkin/scan` |
| Expired kiosk QR (future, >24h iat) | 401 from `/api/checkin/scan` with reason `token_expired` |
| Gym ID typo (numeric but no match) | `not_found` reject |
| Non-numeric Gym ID | Form-level validation, never hits server |
| Public route abuse | No rate limit in Phase 3; mutation is bounded (`gym_id` enumeration just shows reject reasons; no PII leaks) |

---

## 7. Testing

- `tests/lib/qr/token.test.ts` — happy sign/verify, tampered payload, expired iat, malformed.
- `tests/lib/checkin/record.test.ts` — every reject reason + happy path against a real DB (vitest + `phase3_test_*` cleanup pattern from Phase 2).
- `tests/lib/gym-id.test.ts` — sequential assignment, starts at 1000, skips gaps correctly.
- `tests/app/checkin/by-gym-id.test.ts` — integration of the kiosk server action.
- `tests/app/checkin/scan.test.ts` — integration of the mobile-app stub endpoint (happy path, tamper, expired token).
- `tests/app/admin/pending-actions-with-gym-id.test.ts` — approve now assigns gym_id atomically.
- Manual QA: open `/checkin` on a laptop, enter a seeded member's Gym ID, see the green confirmation. Test all five reject reasons by setting up the matching DB state.

---

## 8. Migration notes

- `drizzle/0003_*.sql` — adds `profiles.gym_id` (integer unique nullable) + extends `checkin_source` enum with `'kiosk_id'`.
- Backfill block in the migration: `UPDATE profiles SET gym_id = 1000 + row_number() OVER (ORDER BY created_at) - 1 WHERE status='active' AND gym_id IS NULL`. Safe — no production members exist yet.

---

## 9. Open questions / future work

- **Multi-kiosk / multi-location** — kiosk_id is hardcoded to `'main'` for Phase 3. If the gym ever has two doors, swap to per-kiosk tokens.
- **Anti-replay / rate limiting** — public route. Adding a Cloudflare WAF rule is one knob if abuse appears.
- **Mobile app build** — `/api/checkin/scan` exists but no client. The actual app is a separate project (React Native or similar) outside this repo.
- **Admin override** — if a member loses access to their Gym ID, admin should be able to manually check them in from the member detail page. Deferred to Phase 3.5 or absorbed into a later phase.
- **Same-day re-check-in policy** — currently 1/day. If the gym wants morning + evening visits counted, switch the unique constraint to per-3h window.

---

*Next step: invoke the writing-plans skill to produce a task-by-task implementation plan at `docs/superpowers/plans/2026-05-15-phase-3-qr-checkin.md`.*
