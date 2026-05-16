# Phase 7 — Admin Dashboard + Auth/Landing UI Redesign

**Date:** 2026-05-16
**Status:** Approved (design phase; implementation plan to follow)
**Scope:** Presentation-only redesign of `/admin/*` + auth (`/sign-in`, `/sign-up`) + landing (`/`). Member portal (`/portal`) and kiosk (`/checkin`) intentionally untouched.

---

## 1. Context

Five phases of features shipped (members, payments, QR check-in, PayHere, lifecycle crons, email) on top of a placeholder UI: default shadcn light theme, a 5-item sidebar in `/admin`, a stub `Welcome` page at `/admin`, and a "Gym Management" centered-buttons landing at `/`.

The customer-facing impression matters as we approach handoff. A redesign inspired by the FitStreak dashboard reference — dark navy + red accent + sidebar + stat cards + status pills — gives the admin surface a "real product" feel without rewriting business logic.

### User decisions locked in before brainstorming

- **Surfaces:** `/admin/*`, `/sign-in`, `/sign-up`, `/`. Portal stays light. Kiosk untouched.
- **Match intensity:** adapt the FitStreak pattern, build with shadcn v4 (not pixel-copy).
- **Trainer/staff nav items NOT added** — design doc excludes them ("No trainer/staff roles in MVP").

### User decisions locked in during brainstorming

- **Dashboard home:** 4 stat cards + 2 recent-activity panels.
- **Top bar:** global member-name search AND each page keeps its own filter (both coexist).
- **Breadcrumbs:** every admin page (one segment when top-level).
- **Landing page:** polished hero + plans pricing + CTAs (real public surface).
- **Theme behavior:** dark default on admin/auth/landing; toggle in top bar persists override to localStorage; `/portal` stays light always.

---

## 2. Architecture

```
┌─ Design tokens layer (src/app/globals.css) ─────────────┐
│  :root          → light palette (current, unchanged)    │
│  .dark          → dark palette (RECOLORED:              │
│                    bg = zinc-950, card = zinc-900,      │
│                    primary = red-600, accent = red-tint)│
│  Semantic status colors via @theme inline               │
└──────────────────────────────────────────────────────────┘
       │ class="dark" applied conditionally by layouts
       ▼
┌─ Layout chrome (per route group) ───────────────────────┐
│  /admin     — AdminShell (sidebar + top bar + main)     │
│  /(auth)    — centered card with brand header           │
│  /          — full-page landing                         │
│  /portal    — UNCHANGED (light, current layout)         │
│  /checkin   — UNCHANGED                                  │
└──────────────────────────────────────────────────────────┘
       │ pages restyle inline (no rewrite of business logic)
       ▼
┌─ Pages: 6 admin + 3 public ─────────────────────────────┐
│  /admin                  NEW: dashboard                 │
│  /admin/members          restyled list                  │
│  /admin/members/[id]     restyled detail                │
│  /admin/pending          restyled queue                 │
│  /admin/plans            restyled CRUD                  │
│  /admin/reports          restyled charts                │
│                                                          │
│  /                       NEW: public landing            │
│  /sign-in                styled Clerk SignIn wrapper    │
│  /sign-up                styled Clerk SignUp wrapper    │
└──────────────────────────────────────────────────────────┘
```

### 2.1 No schema changes, no new tables

Phase 7 is presentation-only. The redesign uses existing data via existing queries plus 4 new dashboard queries on existing tables.

### 2.2 One new API endpoint

`GET /api/admin/search-members?q=…` — admin-gated, returns up to 8 member matches (full name, email, or gym_id). Powers the global header search.

### 2.3 Theme strategy

- `/admin/layout.tsx` and `(auth)/layout.tsx` both add `dark` class to `<html>` server-side via a tiny client-mount hook.
- Public landing (`/`) defaults to dark to match the auth/admin chrome members will see right after sign-in.
- `<ThemeToggle>` in the admin top bar reads/writes `localStorage["theme"]`. First paint is always dark; toggle takes effect after hydration.
- `/portal` and `/checkin` layouts do not add `dark`; they stay light regardless.
- `<html suppressHydrationWarning>` on root layout to absorb the post-hydration class flip.

---

## 3. File layout

```
src/
  app/
    globals.css                                  (MODIFY: dark palette + status vars)
    layout.tsx                                   (MODIFY: suppressHydrationWarning)
    page.tsx                                     (REWRITE: landing)
    admin/
      layout.tsx                                 (REWRITE: AdminShell)
      page.tsx                                   (REWRITE: dashboard home)
      _nav.tsx                                   (REPLACED by components/admin/sidebar.tsx)
      members/page.tsx                           (RESTYLE)
      members/[id]/page.tsx                      (RESTYLE + add tabs)
      pending/page.tsx                           (RESTYLE)
      plans/page.tsx                             (RESTYLE)
      reports/page.tsx                           (RESTYLE)
    (auth)/
      layout.tsx                                 (REWRITE: branded card chrome)
      sign-in/[[...sign-in]]/page.tsx            (MODIFY: appearance prop on <SignIn>)
      sign-up/[[...sign-up]]/page.tsx            (MODIFY: appearance prop on <SignUp>)
    api/
      admin/
        search-members/route.ts                  (NEW)

  components/
    admin/
      sidebar.tsx                                (NEW: 5-item nav, icons, active=red)
      top-bar.tsx                                (NEW: breadcrumbs + search + toggle + UserButton)
      breadcrumbs.tsx                            (NEW)
      theme-toggle.tsx                           (NEW: localStorage-backed)
      member-search.tsx                          (NEW: combobox)
      stat-card.tsx                              (NEW)
      status-pill.tsx                            (NEW)
      recent-payments-panel.tsx                  (NEW: dashboard widget)
      recent-checkins-panel.tsx                  (NEW: dashboard widget)

tests/
  components/
    status-pill.test.tsx                         (NEW, 4 tests)
    breadcrumbs.test.tsx                         (NEW, 2 tests)
  app/api/
    admin-search-members.test.ts                 (NEW, 4 tests)
```

No new runtime dependencies. Icons come from `lucide-react` (already installed).

---

## 4. Design tokens

### 4.1 Dark palette (the redesign)

```css
.dark {
  --background: oklch(0.13 0 0);          /* near zinc-950 */
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.18 0 0);                /* near zinc-900 */
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.18 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.6 0.22 27);          /* red-600 */
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.27 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.22 0 0);
  --muted-foreground: oklch(0.68 0 0);
  --accent: oklch(0.27 0.08 27 / 20%);    /* red tint for hover/active */
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.7 0.22 27);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.6 0.22 27);
  --sidebar: oklch(0.15 0 0);
  --sidebar-foreground: oklch(0.7 0 0);
  --sidebar-primary: oklch(0.6 0.22 27);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.27 0.08 27 / 30%);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.6 0.22 27);
}
```

### 4.2 Semantic status colors

Independent of light/dark; used by `<StatusPill>` directly:

```css
@theme inline {
  --color-status-success: oklch(0.7 0.18 145);
  --color-status-success-bg: oklch(0.7 0.18 145 / 15%);
  --color-status-danger: oklch(0.65 0.22 27);
  --color-status-danger-bg: oklch(0.65 0.22 27 / 15%);
  --color-status-warning: oklch(0.78 0.15 75);
  --color-status-warning-bg: oklch(0.78 0.15 75 / 15%);
  --color-status-muted: oklch(0.6 0 0);
  --color-status-muted-bg: oklch(0.6 0 0 / 15%);
}
```

### 4.3 Light palette stays unchanged

`/portal` and `/checkin` continue to use the existing `:root` light theme.

---

## 5. Component contracts

### 5.1 `<Sidebar>`

Server component (no state). 240px wide, full-height, `bg-sidebar`. Renders 5 items:

```tsx
const items = [
  { href: "/admin",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/members",  label: "Members",   icon: Users },
  { href: "/admin/pending",  label: "Pending",   icon: UserPlus },
  { href: "/admin/plans",    label: "Plans",     icon: Tag },
  { href: "/admin/reports",  label: "Reports",   icon: BarChart3 },
];
```

Active item: red-accent background, red 4px left border. Inactive: muted-foreground, hover bg = sidebar-accent. Active state derived client-side from `usePathname()` (sidebar itself is a client component for this reason; or pass `currentPath` as a prop from the layout).

Brand header at top: gym logo (text-only for now: "Muscle Factory Gym") + tagline.

### 5.2 `<TopBar>`

Server component wrapping a client child for the search/toggle. Layout:

```
[ Breadcrumbs ]                          [ Search ] [ Toggle ] [ UserButton ]
```

Sticky top. Border-bottom. Height 56px. Bg = card color.

### 5.3 `<Breadcrumbs items={[…]}>`

Client component. Props: `items: { label: string; href?: string }[]`. Last item rendered as plain text (no link). Separator: `/` or `›`.

Per-page passes its own items:
- `/admin` → `[{ label: "Dashboard" }]`
- `/admin/members` → `[{ label: "Members" }]`
- `/admin/members/[id]` → `[{ label: "Members", href: "/admin/members" }, { label: member.fullName }]`
- `/admin/pending` → `[{ label: "Pending" }]`
- `/admin/plans` → `[{ label: "Plans" }]`
- `/admin/reports` → `[{ label: "Reports" }]`

### 5.4 `<ThemeToggle>`

Client component. Renders Sun/Moon icon button. On mount, reads `localStorage["theme"]`. Click toggles between `"dark"` and `"light"`, applies via `document.documentElement.classList.toggle("dark", value === "dark")`, writes new value to localStorage.

Default state if no localStorage entry: dark (matches server-rendered initial class).

### 5.5 `<MemberSearch>`

Client combobox using `<Command>` from shadcn (added via shadcn CLI if not present) or a small custom combobox built on `@base-ui/react`.

- Input width: ~256px in the top bar
- Placeholder: "Find members…"
- Debounced 200ms fetch to `GET /api/admin/search-members?q=…`
- Renders up to 8 matches; click → `router.push("/admin/members/{id}")`
- Empty `q` or `q.length < 2` → no fetch, dropdown closed
- 0 matches → "No members found"
- Fetch error → "Search unavailable"

### 5.6 `<StatCard>`

```tsx
type Props = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  caption?: string;
  accentColor?: "red" | "green" | "amber" | "blue";
};
```

Used on `/admin` dashboard (4 cards) and `/admin/members/[id]` (4 cards).

Example: `<StatCard icon={Wallet} label="Total Revenue" value="LKR 142,500" caption="This month" accentColor="red" />`

Visual: icon in a colored bg circle (left), label small uppercase (`text-xs tracking-wide`), value large numeric (`text-2xl font-semibold`), caption muted-foreground below.

### 5.7 `<StatusPill>`

```tsx
type Variant =
  | "paid" | "succeeded" | "active"          // green
  | "unpaid" | "failed" | "inactive"         // red
  | "refunded"                               // muted
  | "pending" | "expired";                   // amber

type Props = {
  variant: Variant;
  children?: React.ReactNode;  // override label
};
```

Pill shape: rounded-full, px-2.5 py-0.5, text-xs font-medium. Variant maps to one of the 4 status color pairs.

Replaces every ad-hoc `<Badge>` for status display across admin pages.

### 5.8 `<RecentPaymentsPanel>` / `<RecentCheckinsPanel>`

Server components that accept already-fetched data as props. Render a tight 10-row table with member-name, amount/source, time-ago. Used only on `/admin` dashboard.

---

## 6. Data flow

### 6.1 `/admin` dashboard load (NEW)

```
GET /admin
  │
  ▼ requireAdmin()
  ▼ 6 parallel queries via Promise.all:
  ├─ SELECT SUM(amount_lkr) FROM payments
  │   WHERE status='succeeded' AND paid_at >= start-of-month(todaySL)
  │   AND paid_at < start-of-next-month(todaySL)
  │   → revenue this month
  │
  ├─ SELECT count(*) FROM profiles
  │   WHERE role='member' AND status='active'
  │   → active members
  │
  ├─ SELECT count(*) FROM profiles
  │   WHERE status='pending'
  │   → pending approvals
  │
  ├─ active members + their current memberships + plans + payments
  │   → per-member computeOutstanding(), sum positive
  │   → total outstanding dues
  │
  ├─ SELECT payments.* JOIN profiles WHERE status='succeeded'
  │   ORDER BY paid_at DESC LIMIT 10
  │   → recent payments
  │
  └─ SELECT attendance.* JOIN profiles
      ORDER BY checked_in_at DESC LIMIT 10
      → recent check-ins
  │
  ▼
render dashboard
```

Captions stay static ("This month" / "Across N members") — no month-over-month deltas in Phase 7.

### 6.2 Global header search

```
User types in <MemberSearch>
  │ (200ms debounce)
  ▼
GET /api/admin/search-members?q=…
  │
  ▼ requireAdmin() (401 if not admin)
  ▼ q.length < 2 → return { results: [] }
  ▼
SELECT id, full_name, email, gym_id, photo_url
FROM profiles
WHERE role='member'
  AND (full_name ILIKE '%q%' OR email ILIKE '%q%' OR gym_id::text LIKE 'q%')
ORDER BY full_name
LIMIT 8
  │
  ▼ return { results: [...] }
  ▼ client renders dropdown; click → router.push("/admin/members/{id}")
```

### 6.3 Theme toggle

```
Initial render (server): <html class="dark"> (for admin/auth/landing routes)
  │
  ▼ Client mount: ThemeToggle reads localStorage["theme"]
  │   - "light" → remove "dark" class from <html>
  │   - "dark" or null → keep
  │
  ▼ User clicks toggle:
  │   - Flip class on <html>
  │   - Persist to localStorage
  │   - (no server round-trip)
```

`<html suppressHydrationWarning>` absorbs the post-hydration class flip without warnings.

### 6.4 Member detail page (data unchanged, presentation reorganized)

Existing queries (profile, all memberships, all payments, last 30 attendance) stay the same. The page restructures:

- **Top:** breadcrumbs `Members › <name>`
- **Hero row:** member name, Gym ID, status pill
- **Stat-card row (4):** Total Paid (lifetime succeeded sum), Active Membership (plan + days remaining), Outstanding (LKR or "Settled"), Total Check-ins (lifetime count)
- **Tabbed content:** Payments | Attendance | Memberships
  - Payments tab: existing `_payments-table.tsx` (restyled, status pills)
  - Attendance tab: existing `_attendance-table.tsx` (restyled)
  - Memberships tab: NEW small history table (start, end, plan, status)

Same data, restructured layout. No new SQL.

---

## 7. Error handling

| Failure | Handling |
|---|---|
| Dashboard outstanding-dues per-member loop fails on one member | Skip that member, count the rest. Logged. Caption shows partial result. |
| Any of the 6 dashboard queries throws (DB blip) | Fall through to Next.js error.tsx → "Something went wrong". |
| Member-search `q.length < 2` | Route returns `{ results: [] }` without hitting DB. |
| Member-search returns 0 matches | Dropdown shows "No members found". |
| Member-search fetch error (network / 500) | Dropdown shows "Search unavailable". Sidebar navigation still works. |
| Member-search bombarded with keystrokes | 200ms client debounce. |
| Theme-toggle reads bad localStorage value | Hook treats anything except `"light"` as dark (default). |
| Hydration mismatch on `<html class="dark">` | `suppressHydrationWarning` on root layout absorbs it. |
| `requireAdmin()` fails on a sub-page | Existing redirect to `/sign-in` or `/portal`. |
| Landing page `/` SELECT plans fails | Hide the plans grid section; show "Plans coming soon". Hero + CTA still render. |
| Recharts colors look wrong on dark theme | Pass CSS-var-derived colors via props at JSX time. Update existing chart components. |
| Clerk `<SignIn>` / `<SignUp>` / `<UserButton>` visually breaks on dark | Pass `appearance` prop with our token colors (documented Clerk pattern). |
| Mobile narrow screen (< 768px) | Sidebar gets `hidden md:flex`; hamburger button in top bar opens a slide-over `<Sheet>`. |
| User signs out from `/admin` | Clerk redirects to `/sign-in`. |

### 7.1 Non-obvious decisions

1. **No theme toggle on `/portal`.** Members get the light experience always; toggle exists only in the admin top bar.
2. **Landing `/` defaults to dark** to match the admin chrome.
3. **Server-rendered first paint is always dark** for admin/auth/landing. The light preference takes effect after hydration only. Acceptable; alternative (reading the cookie in middleware) is 2x complexity.
4. **Recharts color override** is the only place where we read CSS vars at runtime via `getComputedStyle()` or pass literal `var(--chart-1)` strings.

---

## 8. Testing

### 8.1 Component tests — 6 tests

`tests/components/status-pill.test.tsx`:
- `paid` variant has green class
- `unpaid` variant has red class
- `pending` variant has amber class
- `refunded` variant has muted class

`tests/components/breadcrumbs.test.tsx`:
- Renders all items in order
- Last item is rendered as plain text, not a link

### 8.2 Route handler test — 4 tests

`tests/app/api/admin-search-members.test.ts`:
- 401 when `requireAdmin` throws (`vi.mock("@/lib/auth")`)
- Empty / short `q` → `{ results: [] }` without DB hit
- Matching by full name → returns the right member
- Matching by gym_id → returns the right member

Uses `user_phase7_test_search_*` clerk-id prefix.

### 8.3 Visual smoke (manual, once at end)

Not automated. Walkthrough:

- `/` → polished landing, dark theme, plans grid loads
- `/sign-in` → branded card chrome around Clerk form, dark
- `/sign-up` → same
- `/admin` (signed in) → 4 stat cards, 2 panels, sidebar active=Dashboard
- `/admin/members` → list with status pills, breadcrumb, filter works
- `/admin/members/[id]` → breadcrumb with name, 4 stat cards, tabs work
- `/admin/pending` → restyled queue
- `/admin/plans` → restyled CRUD
- `/admin/reports` → charts render on dark theme
- Theme toggle → flips light, persists across reload
- Header search → type 3 letters → dropdown → click → jumps to member
- `/portal` → light theme intact, no regression
- `/checkin` → unchanged

### 8.4 No screenshot or Playwright tests

Cost too high for a single-gym MVP. Manual smoke covers the high-value paths. Existing 223 tests must still pass.

### 8.5 Coverage target

223 + 10 = ~233 tests across ~46 files.

---

## 9. Done criteria

1. All new tests green; existing 223 still pass.
2. `npm run build` green.
3. `npm run cf:build` green.
4. Manual smoke walkthrough (§8.3) all checks pass.
5. Tag `phase-7` at the green HEAD.

Production deploy continues to be gated on the OpenNext/CF deploy gap; Phase 7 ships code-and-local-smoke complete.

---

## 10. What's deferred

- **Public landing page polish** (real photos, gym brand identity beyond text). Sandbox-style placeholders this phase.
- **Mobile-native experience** beyond responsive shell — no PWA, no app shell, no touch gestures.
- **Member portal redesign** — stays light + current shadcn-neutral. Phase 7 leaves it alone.
- **Kiosk redesign** — works fine; not in scope.
- **Theme: system-preference auto-detect** — explicitly avoided. Admin/auth/landing default dark; toggle persists override; portal stays light always.
- **Screenshot tests / visual regression** — manual smoke only.
- **Trend deltas on dashboard cards** ("+18% this month") — static captions only this phase.
- **Mobile hamburger sidebar polish** — minimum-viable slide-over via shadcn `<Sheet>`; no deeper mobile UX work.
- **Admin search by phone number** — name/email/gym_id only in v1.
- **Cmd+K command palette** — considered, explicitly deferred.
- **Gym logo image** — text-only ("Muscle Factory Gym") for now; image swap is a config-only change later.
