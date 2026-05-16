# Phase 7 — Admin Dashboard + Auth/Landing UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/admin/*` + `/sign-in` + `/sign-up` + `/` (landing) with a FitStreak-inspired dark navy + red accent theme. Build a real `/admin` dashboard home with stat cards + recent-activity panels, add a global member search to the admin top bar, add breadcrumbs to every admin page, and ship a polished public landing page. Portal and kiosk are NOT touched.

**Architecture:** Presentation-only redesign. No schema changes. One new API endpoint (`GET /api/admin/search-members`). Six new shared admin components in `src/components/admin/`. Theme tokens overhauled in `globals.css`. Per-route layouts conditionally add `class="dark"` to `<html>`; a client `<ThemeToggle>` flips it on user override. Pages get restyled inline using the new shared components — no business-logic rewrites.

**Tech Stack:** Next.js 15 (App Router), Clerk v7, Drizzle + Supabase, Tailwind v4, shadcn v4 (base-ui under the hood), `lucide-react` (already installed), Vitest 4. No new runtime deps.

**Reference design:** `docs/plans/2026-05-16-phase-7-admin-redesign-design.md` (committed `42c03ef`).
**Reference Phase 6:** `docs/superpowers/plans/2026-05-16-phase-6-email.md` for the testing-pattern conventions.

---

## Conventions

- Working directory: `D:\business_projects\Gym_management_system`
- Package manager: **npm**. Lockfile is `package-lock.json`.
- Shell: **PowerShell** (commands also work in bash where noted).
- Every task ends with one `git commit` (Task 0 has none — verification only).
- Code blocks show **full file content** unless a `// ...existing code...` marker says otherwise.
- Path alias `@/` resolves to `src/`.
- `vitest.config.ts` already supports `.test.tsx` files (Phase 6 setup).
- All Phase 7 DB-touching tests use `user_phase7_test_*` clerk-id prefix isolation.
- The 4 lucide icons mentioned in shared components (`LayoutDashboard`, `Users`, `UserPlus`, `Tag`, `BarChart3`, `Wallet`, `Activity`, `Sun`, `Moon`, `Search`, `Menu`, `X`) are all exports of `lucide-react`.

---

## File structure (new and modified)

```
src/
  app/
    globals.css                                  (MODIFY: Task 1)
    layout.tsx                                   (MODIFY: Task 1)
    page.tsx                                     (REWRITE: Task 9)
    admin/
      layout.tsx                                 (REWRITE: Task 4)
      page.tsx                                   (REWRITE: Task 5)
      _nav.tsx                                   (DELETED in Task 4 - replaced)
      members/page.tsx                           (RESTYLE: Task 6)
      members/[id]/page.tsx                      (RESTYLE: Task 7)
      members/[id]/_payments-table.tsx           (RESTYLE: Task 7)
      members/[id]/_attendance-table.tsx         (RESTYLE: Task 7)
      pending/page.tsx                           (RESTYLE: Task 6)
      plans/page.tsx                             (RESTYLE: Task 6)
      reports/page.tsx                           (RESTYLE: Task 6)
    (auth)/
      layout.tsx                                 (REWRITE: Task 8)
      sign-in/[[...sign-in]]/page.tsx            (MODIFY: Task 8)
      sign-up/[[...sign-up]]/page.tsx            (MODIFY: Task 8)
    api/admin/search-members/route.ts            (NEW: Task 3)

  components/admin/
    sidebar.tsx                                  (NEW: Task 2)
    top-bar.tsx                                  (NEW: Task 2)
    breadcrumbs.tsx                              (NEW: Task 2)
    theme-toggle.tsx                             (NEW: Task 2)
    member-search.tsx                            (NEW: Task 3)
    stat-card.tsx                                (NEW: Task 2)
    status-pill.tsx                              (NEW: Task 2)
    recent-payments-panel.tsx                    (NEW: Task 5)
    recent-checkins-panel.tsx                    (NEW: Task 5)

tests/
  components/
    status-pill.test.tsx                         (NEW: Task 2, 4 tests)
    breadcrumbs.test.tsx                         (NEW: Task 2, 2 tests)
  app/api/
    admin-search-members.test.ts                 (NEW: Task 3, 4 tests)
```

---

## Task 0: Verify baseline + create directories

**Why:** Confirm 233 tests green from Phase 6, pre-create new directories.

- [ ] **Step 1: Confirm baseline tests green**

  ```powershell
  npm test
  ```

  Expected: `Tests  223 passed (223)` across 44 files (Phase 6 baseline). If the count differs, stop and report.

- [ ] **Step 2: Create new directories**

  ```bash
  mkdir -p src/components/admin src/app/api/admin/search-members tests/components
  ```

  (On PowerShell: `New-Item -ItemType Directory -Path src/components/admin, src/app/api/admin/search-members, tests/components -Force | Out-Null`)

- [ ] **Step 3: No commit — preparatory only.**

---

## Task 1: Design tokens — dark palette + status colors

**Why:** All shared components consume CSS vars, so tokens come first. The current `.dark` block is neutral grayscale; we recolor it for the FitStreak look (red primary + dark navy backgrounds) and add semantic status color tokens.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the `.dark` block in `src/app/globals.css`**

  Find the existing `.dark { ... }` block (lines 85-117 in current file) and replace its body with:

  ```css
  .dark {
    --background: oklch(0.13 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.18 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.18 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.6 0.22 27);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.27 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.22 0 0);
    --muted-foreground: oklch(0.68 0 0);
    --accent: oklch(0.27 0.08 27 / 20%);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.7 0.22 27);
    --border: oklch(1 0 0 / 8%);
    --input: oklch(1 0 0 / 12%);
    --ring: oklch(0.6 0.22 27);
    --chart-1: oklch(0.6 0.22 27);
    --chart-2: oklch(0.7 0.18 145);
    --chart-3: oklch(0.78 0.15 75);
    --chart-4: oklch(0.6 0 0);
    --chart-5: oklch(0.4 0 0);
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

- [ ] **Step 2: Add status color tokens inside `@theme inline { ... }`**

  Find the closing `}` of the `@theme inline { ... }` block in `src/app/globals.css` (around line 48). BEFORE the closing brace, add:

  ```css
    --color-status-success: oklch(0.7 0.18 145);
    --color-status-success-bg: oklch(0.7 0.18 145 / 15%);
    --color-status-danger: oklch(0.65 0.22 27);
    --color-status-danger-bg: oklch(0.65 0.22 27 / 15%);
    --color-status-warning: oklch(0.78 0.15 75);
    --color-status-warning-bg: oklch(0.78 0.15 75 / 15%);
    --color-status-muted-fg: oklch(0.6 0 0);
    --color-status-muted-bg: oklch(0.6 0 0 / 15%);
  ```

  These map to `bg-status-success`, `text-status-success`, etc. as Tailwind utilities.

- [ ] **Step 3: Add `suppressHydrationWarning` to root `<html>`**

  Open `src/app/layout.tsx`. Find:

  ```tsx
        <html
          lang="en"
          className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
  ```

  Replace with:

  ```tsx
        <html
          lang="en"
          suppressHydrationWarning
          className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
  ```

  This absorbs the post-hydration class flip when `<ThemeToggle>` applies a stored preference. The hydration warning would otherwise log a noisy error to the console.

- [ ] **Step 4: Verify build still passes**

  ```powershell
  npm run build
  ```

  Expected: success. If the build complains about an unused `@ts-expect-error` directive in `src/worker-with-scheduled.ts`, clear `.open-next` first: `rm -rf .open-next && npm run build`.

- [ ] **Step 5: Verify tests still pass**

  ```powershell
  npm test
  ```

  Expected: 223/223.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/globals.css src/app/layout.tsx
  git commit -m "feat(theme): dark palette tokens + status color tokens for Phase 7 redesign"
  ```

---

## Task 2: Shared admin components — sidebar, top bar, breadcrumbs, theme toggle, stat card, status pill

**Why:** Six components form the visual vocabulary that the restyled pages will consume. Building them first means the page restyles in later tasks are simple "swap to new component" diffs.

**Files:**
- Create: `src/components/admin/sidebar.tsx`
- Create: `src/components/admin/top-bar.tsx`
- Create: `src/components/admin/breadcrumbs.tsx`
- Create: `src/components/admin/theme-toggle.tsx`
- Create: `src/components/admin/stat-card.tsx`
- Create: `src/components/admin/status-pill.tsx`
- Create: `tests/components/status-pill.test.tsx`
- Create: `tests/components/breadcrumbs.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `tests/components/status-pill.test.tsx`:

  ```tsx
  import { describe, it, expect } from "vitest";
  import { renderEmail as render } from "@/lib/email/render";
  import { StatusPill } from "@/components/admin/status-pill";

  describe("StatusPill", () => {
    it("paid variant has success color class", async () => {
      const html = await render(<StatusPill variant="paid">Paid</StatusPill>);
      expect(html).toContain("Paid");
      expect(html).toMatch(/status-success/);
    });

    it("unpaid variant has danger color class", async () => {
      const html = await render(<StatusPill variant="unpaid">Unpaid</StatusPill>);
      expect(html).toMatch(/status-danger/);
    });

    it("pending variant has warning color class", async () => {
      const html = await render(<StatusPill variant="pending">Pending</StatusPill>);
      expect(html).toMatch(/status-warning/);
    });

    it("refunded variant has muted color class", async () => {
      const html = await render(<StatusPill variant="refunded">Refunded</StatusPill>);
      expect(html).toMatch(/status-muted/);
    });
  });
  ```

  Note: we reuse Phase 6's `renderEmail()` from `@/lib/email/render` because it's already wired to `@react-email/render`, which calls `react-dom/server` under the hood. For non-email components, this still produces a string of HTML that we can grep for class names — exactly what we want to assert on. No real DOM env needed; no jsdom dependency.

  Create `tests/components/breadcrumbs.test.tsx`:

  ```tsx
  import { describe, it, expect } from "vitest";
  import { renderEmail as render } from "@/lib/email/render";
  import { Breadcrumbs } from "@/components/admin/breadcrumbs";

  describe("Breadcrumbs", () => {
    it("renders all items in order with separators", async () => {
      const html = await render(
        <Breadcrumbs
          items={[
            { label: "Members", href: "/admin/members" },
            { label: "Akasha Nadeel" },
          ]}
        />,
      );
      expect(html).toContain("Members");
      expect(html).toContain("Akasha Nadeel");
      // Members appears before the leaf
      expect(html.indexOf("Members")).toBeLessThan(
        html.indexOf("Akasha Nadeel"),
      );
    });

    it("renders leaf item as plain text (no href anchor)", async () => {
      const html = await render(
        <Breadcrumbs items={[{ label: "Dashboard" }]} />,
      );
      // No <a ... href="..."> wrapping the leaf
      expect(html).not.toMatch(/<a[^>]+href[^>]*>Dashboard<\/a>/);
      expect(html).toContain("Dashboard");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/components/
  ```

- [ ] **Step 3: Implement `<StatusPill>`**

  Create `src/components/admin/status-pill.tsx`:

  ```tsx
  import { cn } from "@/lib/utils";

  export type StatusVariant =
    | "paid"
    | "succeeded"
    | "active"
    | "unpaid"
    | "failed"
    | "inactive"
    | "refunded"
    | "pending"
    | "expired"
    | "cancelled";

  const variantClasses: Record<StatusVariant, string> = {
    paid: "bg-status-success-bg text-status-success",
    succeeded: "bg-status-success-bg text-status-success",
    active: "bg-status-success-bg text-status-success",
    unpaid: "bg-status-danger-bg text-status-danger",
    failed: "bg-status-danger-bg text-status-danger",
    inactive: "bg-status-danger-bg text-status-danger",
    refunded: "bg-status-muted-bg text-status-muted-fg",
    pending: "bg-status-warning-bg text-status-warning",
    expired: "bg-status-warning-bg text-status-warning",
    cancelled: "bg-status-muted-bg text-status-muted-fg",
  };

  export function StatusPill({
    variant,
    children,
    className,
  }: {
    variant: StatusVariant;
    children?: React.ReactNode;
    className?: string;
  }) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
          variantClasses[variant],
          className,
        )}
      >
        {children ?? variant}
      </span>
    );
  }
  ```

- [ ] **Step 4: Implement `<Breadcrumbs>`**

  Create `src/components/admin/breadcrumbs.tsx`:

  ```tsx
  import Link from "next/link";
  import { ChevronRight } from "lucide-react";

  export type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
    return (
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-foreground font-medium" : ""}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRight className="size-3.5 shrink-0" />}
            </span>
          );
        })}
      </nav>
    );
  }
  ```

- [ ] **Step 5: Implement `<ThemeToggle>`**

  Create `src/components/admin/theme-toggle.tsx`:

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import { Sun, Moon } from "lucide-react";
  import { Button } from "@/components/ui/button";

  type Theme = "light" | "dark";

  function readStoredTheme(): Theme {
    if (typeof window === "undefined") return "dark";
    const v = window.localStorage.getItem("theme");
    return v === "light" ? "light" : "dark";
  }

  function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }

  export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>("dark");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      const stored = readStoredTheme();
      setTheme(stored);
      applyTheme(stored);
      setMounted(true);
    }, []);

    function flip() {
      const next: Theme = theme === "dark" ? "light" : "dark";
      setTheme(next);
      applyTheme(next);
      window.localStorage.setItem("theme", next);
    }

    if (!mounted) {
      // Render the icon at server first paint so the layout doesn't shift.
      return (
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Moon className="size-4" />
        </Button>
      );
    }

    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={flip}
      >
        {theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>
    );
  }
  ```

- [ ] **Step 6: Implement `<StatCard>`**

  Create `src/components/admin/stat-card.tsx`:

  ```tsx
  import { cn } from "@/lib/utils";
  import type { LucideIcon } from "lucide-react";

  export type StatCardAccent = "red" | "green" | "amber" | "blue" | "default";

  const accentBg: Record<StatCardAccent, string> = {
    red: "bg-status-danger-bg text-status-danger",
    green: "bg-status-success-bg text-status-success",
    amber: "bg-status-warning-bg text-status-warning",
    blue: "bg-primary/10 text-primary",
    default: "bg-muted text-muted-foreground",
  };

  export function StatCard({
    icon: Icon,
    label,
    value,
    caption,
    accentColor = "default",
    className,
  }: {
    icon: LucideIcon;
    label: string;
    value: string | number;
    caption?: string;
    accentColor?: StatCardAccent;
    className?: string;
  }) {
    return (
      <div
        className={cn(
          "rounded-xl border bg-card p-5 flex items-start gap-4",
          className,
        )}
      >
        <div
          className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            accentBg[accentColor],
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">
            {value}
          </div>
          {caption && (
            <div className="text-xs text-muted-foreground mt-1">{caption}</div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 7: Implement `<Sidebar>`**

  Create `src/components/admin/sidebar.tsx`:

  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import {
    LayoutDashboard,
    Users,
    UserPlus,
    Tag,
    BarChart3,
    type LucideIcon,
  } from "lucide-react";
  import { cn } from "@/lib/utils";

  const items: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/members", label: "Members", icon: Users },
    { href: "/admin/pending", label: "Pending", icon: UserPlus },
    { href: "/admin/plans", label: "Plans", icon: Tag },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ];

  export function Sidebar() {
    const pathname = usePathname();
    return (
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-base font-semibold text-foreground">
            Muscle Factory Gym
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Admin console
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {items.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    );
  }
  ```

- [ ] **Step 8: Implement `<TopBar>` (without search — search is Task 3)**

  Create `src/components/admin/top-bar.tsx`:

  ```tsx
  import { UserButton } from "@clerk/nextjs";
  import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
  import { ThemeToggle } from "./theme-toggle";
  import { MemberSearch } from "./member-search";

  export function TopBar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
    return (
      <header className="sticky top-0 z-20 h-14 border-b bg-card flex items-center justify-between px-4 md:px-6 gap-4">
        <div className="min-w-0 flex-1">
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MemberSearch />
          <ThemeToggle />
          <UserButton />
        </div>
      </header>
    );
  }
  ```

  Note: this imports `<MemberSearch>` which doesn't exist yet (Task 3). The build will fail until Task 3 lands. That's expected — we'll commit Task 2 and Task 3 as separate logical units; if you want a strictly-green-build approach, create a stub `member-search.tsx` here that returns `null`, and replace it in Task 3.

  To keep this task buildable in isolation, create a stub `src/components/admin/member-search.tsx`:

  ```tsx
  export function MemberSearch() {
    return null;
  }
  ```

  Task 3 will replace this file with the real implementation.

- [ ] **Step 9: Run tests — expect 6/6 pass**

  ```powershell
  npm test -- tests/components/
  ```

  Expected: 4 status-pill + 2 breadcrumbs = 6 tests pass.

- [ ] **Step 10: Verify build passes**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 11: Commit**

  ```powershell
  git add src/components/admin/ tests/components/
  git commit -m "feat(admin-ui): shared sidebar, top bar, breadcrumbs, theme toggle, stat card, status pill"
  ```

---

## Task 3: Global member search — API endpoint + `<MemberSearch>` combobox

**Why:** Headerwide search lets the admin jump straight to any member from any page. Endpoint is admin-gated, returns up to 8 matches by name, email, or gym_id.

**Files:**
- Create: `src/app/api/admin/search-members/route.ts`
- Replace: `src/components/admin/member-search.tsx` (stub from Task 2)
- Create: `tests/app/api/admin-search-members.test.ts`

- [ ] **Step 1: Write the failing route test**

  Create `tests/app/api/admin-search-members.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { eq, like } from "drizzle-orm";

  vi.mock("@/lib/auth", () => ({
    requireAdmin: vi.fn(),
  }));

  import { GET } from "@/app/api/admin/search-members/route";
  import { requireAdmin } from "@/lib/auth";

  const CLERK_PREFIX = "user_phase7_test_search_";

  async function clean() {
    await db
      .delete(profiles)
      .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  }

  beforeEach(async () => {
    await clean();
    vi.mocked(requireAdmin).mockResolvedValue(undefined as never);
  });

  afterEach(async () => {
    await clean();
    vi.restoreAllMocks();
  });

  describe("GET /api/admin/search-members", () => {
    it("returns 401 when requireAdmin throws", async () => {
      vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("not admin"));
      const res = await GET(
        new Request("http://localhost/api/admin/search-members?q=akila"),
      );
      expect(res.status).toBe(401);
    });

    it("returns empty results for q shorter than 2 chars (no DB hit)", async () => {
      const res = await GET(
        new Request("http://localhost/api/admin/search-members?q=a"),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { results: unknown[] };
      expect(json.results).toEqual([]);
    });

    it("returns matching members by full name", async () => {
      await db.insert(profiles).values({
        clerkUserId: `${CLERK_PREFIX}target`,
        email: "akila.target@x.lk",
        fullName: "Akila Target",
        role: "member",
        status: "active",
      });
      const res = await GET(
        new Request("http://localhost/api/admin/search-members?q=akila"),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        results: { fullName: string }[];
      };
      const names = json.results.map((r) => r.fullName);
      expect(names).toContain("Akila Target");
    });

    it("returns matching members by gym_id prefix", async () => {
      await db.insert(profiles).values({
        clerkUserId: `${CLERK_PREFIX}gymid`,
        email: "gymid@x.lk",
        fullName: "GymId Member",
        role: "member",
        status: "active",
        gymId: 1500,
      });
      const res = await GET(
        new Request("http://localhost/api/admin/search-members?q=1500"),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        results: { fullName: string; gymId: number | null }[];
      };
      const names = json.results.map((r) => r.fullName);
      expect(names).toContain("GymId Member");
    });
  });
  ```

- [ ] **Step 2: Run — expect failure (module not found)**

  ```powershell
  npm test -- tests/app/api/admin-search-members.test.ts
  ```

- [ ] **Step 3: Implement the route**

  Create `src/app/api/admin/search-members/route.ts`:

  ```ts
  import { NextResponse } from "next/server";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { and, eq, ilike, or, sql } from "drizzle-orm";
  import { requireAdmin } from "@/lib/auth";

  export async function GET(req: Request) {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const pattern = `%${q}%`;
    const numeric = /^\d+$/.test(q) ? Number(q) : null;

    const matchers = [
      ilike(profiles.fullName, pattern),
      ilike(profiles.email, pattern),
    ];
    if (numeric !== null) {
      matchers.push(eq(profiles.gymId, numeric));
    }

    const rows = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        gymId: profiles.gymId,
        photoUrl: profiles.photoUrl,
      })
      .from(profiles)
      .where(and(eq(profiles.role, "member"), or(...matchers)))
      .orderBy(profiles.fullName)
      .limit(8);

    return NextResponse.json({ results: rows });
  }
  ```

- [ ] **Step 4: Replace the stub `<MemberSearch>` with the real implementation**

  Open `src/components/admin/member-search.tsx`. Replace its contents with:

  ```tsx
  "use client";

  import { useEffect, useRef, useState } from "react";
  import { useRouter } from "next/navigation";
  import { Search } from "lucide-react";
  import { cn } from "@/lib/utils";

  type Member = {
    id: string;
    fullName: string;
    email: string;
    gymId: number | null;
    photoUrl: string | null;
  };

  export function MemberSearch() {
    const router = useRouter();
    const [q, setQ] = useState("");
    const [results, setResults] = useState<Member[] | null>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errored, setErrored] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (q.trim().length < 2) {
        setResults(null);
        setLoading(false);
        setErrored(false);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);
      setErrored(false);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/admin/search-members?q=${encodeURIComponent(q)}`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            setErrored(true);
            setResults(null);
            return;
          }
          const json = (await res.json()) as { results: Member[] };
          setResults(json.results);
        } catch {
          setErrored(true);
          setResults(null);
        } finally {
          setLoading(false);
        }
      }, 200);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [q]);

    useEffect(() => {
      function onDocClick(e: MouseEvent) {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    function go(memberId: string) {
      setOpen(false);
      setQ("");
      router.push(`/admin/members/${memberId}`);
    }

    const showDropdown = open && q.trim().length >= 2;

    return (
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Find members…"
            className={cn(
              "h-9 w-48 md:w-64 rounded-md border bg-background pl-8 pr-3 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
          />
        </div>
        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 w-64 md:w-72 rounded-md border bg-popover text-popover-foreground shadow-lg z-30 max-h-80 overflow-auto">
            {loading && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Searching…
              </div>
            )}
            {!loading && errored && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Search unavailable.
              </div>
            )}
            {!loading && !errored && results && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No members found.
              </div>
            )}
            {!loading && !errored && results && results.length > 0 && (
              <ul className="py-1">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => go(m.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                    >
                      <div className="font-medium">{m.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.gymId !== null && (
                          <span className="font-mono mr-2">#{m.gymId}</span>
                        )}
                        {m.email}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 5: Run tests — expect 4/4 pass**

  ```powershell
  npm test -- tests/app/api/admin-search-members.test.ts
  ```

- [ ] **Step 6: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/api/admin/search-members/ src/components/admin/member-search.tsx tests/app/api/admin-search-members.test.ts
  git commit -m "feat(admin-ui): global member search endpoint + top-bar combobox"
  ```

---

## Task 4: Admin layout shell — replace the old layout

**Why:** Wire the new `<Sidebar>` + `<TopBar>` into `src/app/admin/layout.tsx`. Each admin page also needs to supply its breadcrumbs; since `breadcrumbs` come from the page, we use a per-page render approach: the layout exposes a shell, and each page wraps its content in `<AdminPage breadcrumbs={[...]}>`.

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Create: `src/components/admin/admin-page.tsx`
- Delete: `src/app/admin/_nav.tsx`

- [ ] **Step 1: Create `<AdminPage>` wrapper**

  Create `src/components/admin/admin-page.tsx`:

  ```tsx
  import { TopBar } from "./top-bar";
  import type { BreadcrumbItem } from "./breadcrumbs";

  /**
   * Per-page wrapper. Each admin page renders <AdminPage breadcrumbs={[...]}>
   * around its content; the layout supplies the sidebar shell.
   */
  export function AdminPage({
    breadcrumbs,
    children,
  }: {
    breadcrumbs: BreadcrumbItem[];
    children: React.ReactNode;
  }) {
    return (
      <>
        <TopBar breadcrumbs={breadcrumbs} />
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
      </>
    );
  }
  ```

- [ ] **Step 2: Replace `src/app/admin/layout.tsx`**

  ```tsx
  import { requireAdmin } from "@/lib/auth";
  import { Sidebar } from "@/components/admin/sidebar";

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    await requireAdmin();
    return (
      <div className="dark min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    );
  }
  ```

  The `dark` class on the outer wrapper makes everything under `/admin` use the dark palette by default. The `<ThemeToggle>` later flips this on user override by setting the class on `<html>` (which takes precedence due to CSS specificity rules — actually no, both are at the same level. We move the toggle logic to set the class on `<html>` only; layout's `dark` becomes a fallback. The toggle's `applyTheme()` already targets `document.documentElement`, so it adds/removes from `<html>`. The layout's `<div class="dark">` is for SSR first paint only. When toggle removes from `<html>`, the layout's `<div class="dark">` would still apply. To fix, we let the toggle remove the class from BOTH places. Simpler: just don't put `dark` on the layout div — rely on the layout-level theme-init script.)

  Replace the layout with the corrected version:

  ```tsx
  import { requireAdmin } from "@/lib/auth";
  import { Sidebar } from "@/components/admin/sidebar";

  // This inline script runs before React hydrates. It reads the user's
  // localStorage preference (defaulting to "dark") and applies the class
  // to <html>. Prevents flash-of-unstyled-theme on cold load.
  const themeInitScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light') document.documentElement.classList.add('dark');
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  })();
  `;

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    await requireAdmin();
    return (
      <>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
        <div className="min-h-screen flex bg-background text-foreground">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">{children}</div>
        </div>
      </>
    );
  }
  ```

  The inline script runs synchronously in the document head before paint, setting the `dark` class on `<html>` if the user prefers it (or defaults to dark). React hydration leaves it alone thanks to the `suppressHydrationWarning` set in Task 1.

- [ ] **Step 3: Delete the old nav**

  ```bash
  git rm src/app/admin/_nav.tsx
  ```

  (On PowerShell: same command works.)

- [ ] **Step 4: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success. The build will likely fail if any page still imports `./_nav` — none should (only `layout.tsx` did, and we just rewrote it). If a page still imports `<AdminNav>`, search and remove.

  ```bash
  grep -r "AdminNav\|from.*_nav" src/
  ```

  Expected: no matches.

- [ ] **Step 5: Manually inspect the layout in dev**

  ```powershell
  npm run dev
  ```

  Open `http://localhost:3000/admin` as an admin. Expect a dark layout with the new sidebar on the left, dark top bar at the top with the search input + theme toggle + Clerk user button. The old stub page content still appears in the main area.

  If the page goes blank or the layout breaks, inspect the browser console for hydration errors. The most common cause is the script reading `localStorage` failing — check the inline script's quoting.

  Stop the dev server (Ctrl+C) when done.

- [ ] **Step 6: Run the full test suite**

  ```powershell
  npm test
  ```

  Expected: 223 + 6 (Task 2) + 4 (Task 3) = 233 tests pass.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/admin/layout.tsx src/components/admin/admin-page.tsx
  git commit -m "feat(admin-ui): rewrite layout shell with sidebar + theme-init script"
  ```

---

## Task 5: New `/admin` dashboard home — stat cards + recent activity

**Why:** The admin landing page goes from a "Welcome" stub to a real dashboard. 4 stat cards on top + 2 recent-activity panels below.

**Files:**
- Replace: `src/app/admin/page.tsx`
- Create: `src/components/admin/recent-payments-panel.tsx`
- Create: `src/components/admin/recent-checkins-panel.tsx`

- [ ] **Step 1: Create `<RecentPaymentsPanel>`**

  Create `src/components/admin/recent-payments-panel.tsx`:

  ```tsx
  import Link from "next/link";
  import { format, formatDistanceToNow } from "date-fns";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { StatusPill } from "./status-pill";

  export type RecentPayment = {
    id: string;
    memberId: string;
    memberName: string;
    amountLkr: string;
    method: "cash" | "bank_transfer" | "payhere";
    status: "pending" | "succeeded" | "failed" | "refunded";
    paidAt: Date;
  };

  export function RecentPaymentsPanel({ rows }: { rows: RecentPayment[] }) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Recent payments</CardTitle>
          <Button variant="ghost" size="sm" render={<Link href="/admin/reports" />}>
            View all
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground text-center">
              No payments yet.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((p) => {
                const amount = Number(p.amountLkr);
                return (
                  <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/members/${p.memberId}`}
                        className="font-medium text-sm hover:underline truncate block"
                      >
                        {p.memberName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {p.method.replace("_", " ")} ·{" "}
                        {formatDistanceToNow(p.paidAt, { addSuffix: true })}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium tabular-nums text-sm">
                        {amount < 0 ? "-" : ""}LKR{" "}
                        {Math.abs(amount).toLocaleString()}
                      </div>
                      <StatusPill variant={p.status} className="mt-1">
                        {p.status}
                      </StatusPill>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Create `<RecentCheckinsPanel>`**

  Create `src/components/admin/recent-checkins-panel.tsx`:

  ```tsx
  import Link from "next/link";
  import { formatDistanceToNow } from "date-fns";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

  export type RecentCheckin = {
    id: string;
    memberId: string;
    memberName: string;
    gymId: number | null;
    checkedInAt: Date;
    source: "qr_scan" | "manual" | "kiosk_id";
  };

  const sourceLabel: Record<RecentCheckin["source"], string> = {
    qr_scan: "QR scan",
    manual: "Manual",
    kiosk_id: "Kiosk",
  };

  export function RecentCheckinsPanel({ rows }: { rows: RecentCheckin[] }) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent check-ins</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-sm text-muted-foreground text-center">
              No check-ins yet.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/members/${c.memberId}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {c.memberName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.gymId !== null && (
                        <span className="font-mono mr-2">#{c.gymId}</span>
                      )}
                      {sourceLabel[c.source]} ·{" "}
                      {formatDistanceToNow(c.checkedInAt, { addSuffix: true })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 3: Replace `src/app/admin/page.tsx`**

  ```tsx
  import { db } from "@/db";
  import { profiles, payments, attendance, memberships, plans } from "@/db/schema";
  import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import { Wallet, Users, UserPlus, AlertCircle } from "lucide-react";
  import { AdminPage } from "@/components/admin/admin-page";
  import { StatCard } from "@/components/admin/stat-card";
  import {
    RecentPaymentsPanel,
    type RecentPayment,
  } from "@/components/admin/recent-payments-panel";
  import {
    RecentCheckinsPanel,
    type RecentCheckin,
  } from "@/components/admin/recent-checkins-panel";
  import { todayInSL } from "@/lib/tz";
  import { computeOutstanding } from "@/lib/payments/outstanding";
  import { getCurrentMembership } from "@/lib/memberships/current";

  function startOfMonthSL(todaySL: string): string {
    return `${todaySL.slice(0, 7)}-01`;
  }
  function startOfNextMonthSL(todaySL: string): string {
    const [y, m] = todaySL.split("-").map(Number);
    if (m === 12) return `${y + 1}-01-01`;
    return `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }

  export default async function AdminHome() {
    const admin = await requireAdminProfile();
    const today = todayInSL();
    const monthStart = startOfMonthSL(today);
    const monthEnd = startOfNextMonthSL(today);

    const [
      revenueRow,
      activeRow,
      pendingRow,
      activeMembers,
      paymentsRaw,
      checkinsRaw,
    ] = await Promise.all([
      db
        .select({ total: sql<string | null>`sum(${payments.amountLkr})` })
        .from(payments)
        .where(
          and(
            eq(payments.status, "succeeded"),
            gte(payments.paidAt, new Date(`${monthStart}T00:00:00Z`)),
            lt(payments.paidAt, new Date(`${monthEnd}T00:00:00Z`)),
          ),
        ),
      db
        .select({ count: sql<string>`count(*)` })
        .from(profiles)
        .where(and(eq(profiles.role, "member"), eq(profiles.status, "active"))),
      db
        .select({ count: sql<string>`count(*)` })
        .from(profiles)
        .where(eq(profiles.status, "pending")),
      db
        .select()
        .from(profiles)
        .where(and(eq(profiles.role, "member"), eq(profiles.status, "active"))),
      db
        .select({
          id: payments.id,
          memberId: payments.memberId,
          memberName: profiles.fullName,
          amountLkr: payments.amountLkr,
          method: payments.method,
          status: payments.status,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .innerJoin(profiles, eq(profiles.id, payments.memberId))
        .where(eq(payments.status, "succeeded"))
        .orderBy(desc(payments.paidAt))
        .limit(10),
      db
        .select({
          id: attendance.id,
          memberId: attendance.memberId,
          memberName: profiles.fullName,
          gymId: profiles.gymId,
          checkedInAt: attendance.checkedInAt,
          source: attendance.source,
        })
        .from(attendance)
        .innerJoin(profiles, eq(profiles.id, attendance.memberId))
        .orderBy(desc(attendance.checkedInAt))
        .limit(10),
    ]);

    const revenue = Number(revenueRow[0]?.total ?? 0);
    const activeCount = Number(activeRow[0]?.count ?? 0);
    const pendingCount = Number(pendingRow[0]?.count ?? 0);

    // Compute total outstanding across active members. For each, fetch their
    // memberships + payments and call computeOutstanding(). For 500-member
    // scale this is ~500 queries — acceptable; optimize later if it bites.
    let outstandingTotal = 0;
    let outstandingPartial = false;
    for (const m of activeMembers) {
      try {
        const ms = await db
          .select({
            id: memberships.id,
            status: memberships.status,
            startDate: memberships.startDate,
            endDate: memberships.endDate,
            planPriceLkr: plans.priceLkr,
            planName: plans.name,
          })
          .from(memberships)
          .innerJoin(plans, eq(memberships.planId, plans.id))
          .where(eq(memberships.memberId, m.id));
        const current = getCurrentMembership(ms, today);
        if (!current) continue;
        const ps = await db
          .select()
          .from(payments)
          .where(eq(payments.memberId, m.id));
        const out = computeOutstanding({
          planPriceLkr: current.planPriceLkr,
          payments: ps.map((p) => ({
            id: p.id,
            amountLkr: p.amountLkr,
            kind: p.kind,
            status: p.status,
            membershipId: p.membershipId,
          })),
          membershipId: current.id,
        });
        outstandingTotal += Number(out);
      } catch (err) {
        console.warn(`[dashboard] outstanding calc failed for ${m.id}: ${err}`);
        outstandingPartial = true;
      }
    }

    return (
      <AdminPage breadcrumbs={[{ label: "Dashboard" }]}>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Here&apos;s what&apos;s happening at the gym today.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Wallet}
              label="Total revenue"
              value={`LKR ${revenue.toLocaleString()}`}
              caption="This month"
              accentColor="red"
            />
            <StatCard
              icon={Users}
              label="Active members"
              value={activeCount}
              caption="Current"
              accentColor="green"
            />
            <StatCard
              icon={UserPlus}
              label="Pending approvals"
              value={pendingCount}
              caption={pendingCount === 0 ? "All caught up" : "Needs review"}
              accentColor="amber"
            />
            <StatCard
              icon={AlertCircle}
              label="Outstanding dues"
              value={`LKR ${outstandingTotal.toLocaleString()}`}
              caption={outstandingPartial ? "(partial)" : "Across active members"}
              accentColor="red"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentPaymentsPanel rows={paymentsRaw as RecentPayment[]} />
            <RecentCheckinsPanel rows={checkinsRaw as RecentCheckin[]} />
          </div>
        </div>
      </AdminPage>
    );
  }
  ```

- [ ] **Step 4: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 5: Manual smoke**

  ```powershell
  npm run dev
  ```

  Visit `/admin`. Expect: breadcrumb "Dashboard", 4 stat cards in a row, two panels below (Recent payments, Recent check-ins). Cards show real data from the DB. Ctrl+C when done.

- [ ] **Step 6: Run the test suite**

  ```powershell
  npm test
  ```

  Expected: 233 still pass.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/admin/page.tsx src/components/admin/recent-payments-panel.tsx src/components/admin/recent-checkins-panel.tsx
  git commit -m "feat(admin-ui): dashboard home with stat cards + recent activity panels"
  ```

---

## Task 6: Restyle admin list pages — members, pending, plans, reports

**Why:** Each existing list page gets the breadcrumb + status-pill upgrade. No business logic changes.

**Files:**
- Modify: `src/app/admin/members/page.tsx`
- Modify: `src/app/admin/pending/page.tsx`
- Modify: `src/app/admin/plans/page.tsx`
- Modify: `src/app/admin/reports/page.tsx`

- [ ] **Step 1: Restyle `members/page.tsx`**

  Open `src/app/admin/members/page.tsx`. The full new content (existing query logic unchanged; UI rewrapped):

  ```tsx
  import Link from "next/link";
  import { db } from "@/db";
  import { profiles } from "@/db/schema";
  import { and, eq, ilike, or, count, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { Button } from "@/components/ui/button";
  import { MemberFilters } from "./_filters";
  import { AdminPage } from "@/components/admin/admin-page";
  import { StatusPill } from "@/components/admin/status-pill";

  const PAGE_SIZE = 25;

  type SearchParams = {
    status?: string;
    q?: string;
    page?: string;
  };

  export default async function MembersPage({
    searchParams,
  }: {
    searchParams: Promise<SearchParams>;
  }) {
    await requireAdminProfile();
    const sp = await searchParams;

    const status =
      sp.status === "pending" || sp.status === "active" || sp.status === "inactive"
        ? sp.status
        : undefined;
    const q = (sp.q ?? "").trim();
    const page = Math.max(1, Number(sp.page ?? "1") || 1);

    const filters = [eq(profiles.role, "member")];
    if (status) filters.push(eq(profiles.status, status));
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(ilike(profiles.fullName, pattern), ilike(profiles.email, pattern))!,
      );
    }
    const whereExpr = filters.length === 1 ? filters[0] : and(...filters);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(profiles)
      .where(whereExpr);

    const rows = await db
      .select()
      .from(profiles)
      .where(whereExpr)
      .orderBy(desc(profiles.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    function pageHref(p: number) {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      return qs ? `/admin/members?${qs}` : "/admin/members";
    }

    return (
      <AdminPage breadcrumbs={[{ label: "Members" }]}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Members</h2>
          </div>
          <MemberFilters status={status} q={q} />
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Gym ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-40">Joined</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-6"
                    >
                      No members match your filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono tabular-nums">
                      {m.gymId ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{m.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <StatusPill variant={m.status}>{m.status}</StatusPill>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.createdAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        render={<Link href={`/admin/members/${m.id}`} />}
                        size="sm"
                        variant="ghost"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                render={<Link href={pageHref(Math.max(1, page - 1))} />}
                variant="outline"
                size="sm"
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                render={<Link href={pageHref(Math.min(totalPages, page + 1))} />}
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </AdminPage>
    );
  }
  ```

- [ ] **Step 2: Restyle `pending/page.tsx`**

  Open `src/app/admin/pending/page.tsx`. Find the outer `return` JSX. Wrap the existing content in `<AdminPage breadcrumbs={[{ label: "Pending" }]}>` + replace any inline status `<Badge>` with `<StatusPill variant="pending">pending</StatusPill>`.

  Concretely: find the file's outermost return block. The current structure is approximately:

  ```tsx
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Pending approvals</h2>
      ...
    </div>
  );
  ```

  Change the import block to add at the top of the file:

  ```tsx
  import { AdminPage } from "@/components/admin/admin-page";
  ```

  And wrap the return:

  ```tsx
  return (
    <AdminPage breadcrumbs={[{ label: "Pending" }]}>
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Pending approvals</h2>
        ...existing content...
      </div>
    </AdminPage>
  );
  ```

  No other changes needed for this page (no status pills to swap on a pending-only list).

- [ ] **Step 3: Restyle `plans/page.tsx`**

  Open `src/app/admin/plans/page.tsx`. Same pattern as Step 2:

  Add at the top:

  ```tsx
  import { AdminPage } from "@/components/admin/admin-page";
  ```

  Wrap the outermost return JSX in `<AdminPage breadcrumbs={[{ label: "Plans" }]}>`.

- [ ] **Step 4: Restyle `reports/page.tsx`**

  Open `src/app/admin/reports/page.tsx`. Add the import:

  ```tsx
  import { AdminPage } from "@/components/admin/admin-page";
  ```

  Wrap the outermost return JSX in `<AdminPage breadcrumbs={[{ label: "Reports" }]}>`.

- [ ] **Step 5: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 6: Run the test suite**

  ```powershell
  npm test
  ```

  Expected: 233 still pass.

- [ ] **Step 7: Manual smoke**

  ```powershell
  npm run dev
  ```

  Visit `/admin/members`, `/admin/pending`, `/admin/plans`, `/admin/reports`. Each should show the new top bar with a breadcrumb, the sidebar's active item highlighted, and the page content rendered in dark theme. Status pills on Members should show green for active, red for inactive, amber for pending.

  Ctrl+C when done.

- [ ] **Step 8: Commit**

  ```powershell
  git add src/app/admin/members/page.tsx src/app/admin/pending/page.tsx src/app/admin/plans/page.tsx src/app/admin/reports/page.tsx
  git commit -m "feat(admin-ui): restyle members/pending/plans/reports with breadcrumbs + status pills"
  ```

---

## Task 7: Restyle member detail page with stat cards

**Why:** The member detail page is the most visually-rebuilt page. Adds 4 stat cards at the top (Total Paid, Active Membership, Outstanding, Total Check-ins). Existing content (Payments, Attendance, Membership history tables) restyled with status pills.

**Files:**
- Modify: `src/app/admin/members/[id]/page.tsx`
- Modify: `src/app/admin/members/[id]/_payments-table.tsx`
- Modify: `src/app/admin/members/[id]/_attendance-table.tsx`

- [ ] **Step 1: Replace `members/[id]/page.tsx`**

  ```tsx
  import { notFound } from "next/navigation";
  import { db } from "@/db";
  import { profiles, memberships, plans, payments, attendance } from "@/db/schema";
  import { eq, desc } from "drizzle-orm";
  import { requireAdminProfile } from "@/lib/auth";
  import { getCurrentMembership } from "@/lib/memberships/current";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { format } from "date-fns";
  import { todayInSL } from "@/lib/tz";
  import { computeOutstanding } from "@/lib/payments/outstanding";
  import { daysRemaining } from "@/lib/days-remaining";
  import { Wallet, Calendar, AlertCircle, Activity } from "lucide-react";
  import { AdminPage } from "@/components/admin/admin-page";
  import { StatCard } from "@/components/admin/stat-card";
  import { StatusPill } from "@/components/admin/status-pill";
  import { PaymentsTable } from "./_payments-table";
  import { RecordPaymentButton } from "./_record-payment-button";
  import { AttendanceTable } from "./_attendance-table";

  export default async function MemberDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    await requireAdminProfile();
    const { id } = await params;

    const [member] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    if (!member) notFound();

    const history = await db
      .select({
        id: memberships.id,
        status: memberships.status,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        planName: plans.name,
        planPriceLkr: plans.priceLkr,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.memberId, id))
      .orderBy(desc(memberships.endDate));

    const today = todayInSL();
    const current = getCurrentMembership(history, today);

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, id))
      .orderBy(desc(payments.paidAt));

    const refundedReferences = new Set(
      paymentRows
        .filter((p) => p.status === "refunded" && p.reference)
        .map((p) => p.reference!),
    );

    const attendanceRows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, id))
      .orderBy(desc(attendance.checkedInAt))
      .limit(30);

    const outstanding = current
      ? computeOutstanding({
          planPriceLkr: current.planPriceLkr,
          payments: paymentRows.map((p) => ({
            id: p.id,
            amountLkr: p.amountLkr,
            kind: p.kind,
            status: p.status,
            membershipId: p.membershipId,
          })),
          membershipId: current.id,
        })
      : null;

    // Lifetime totals for stat cards
    const totalPaid = paymentRows
      .filter((p) => p.status === "succeeded")
      .reduce((s, p) => s + Number(p.amountLkr), 0);
    const totalCheckinsRow = await db
      .select({ count: eq(attendance.memberId, id) ? attendance.id : attendance.id })
      .from(attendance)
      .where(eq(attendance.memberId, id));
    const totalCheckins = totalCheckinsRow.length;

    const activeMembershipCaption = (() => {
      if (!current) return "None";
      const days = Math.max(0, daysRemaining({ today, endDate: current.endDate }));
      return `${days} day${days === 1 ? "" : "s"} remaining`;
    })();

    return (
      <AdminPage
        breadcrumbs={[
          { label: "Members", href: "/admin/members" },
          { label: member.fullName },
        ]}
      >
        <div className="space-y-6">
          {/* Hero row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold truncate">
                  {member.fullName}
                </h2>
                <StatusPill variant={member.status}>{member.status}</StatusPill>
              </div>
              <div className="text-muted-foreground text-sm mt-1">
                {member.email}
              </div>
              {member.gymId !== null && (
                <div className="text-muted-foreground text-sm mt-0.5">
                  Gym ID:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {member.gymId}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Wallet}
              label="Total paid"
              value={`LKR ${totalPaid.toLocaleString()}`}
              caption="Lifetime succeeded"
              accentColor="green"
            />
            <StatCard
              icon={Calendar}
              label="Active membership"
              value={current?.planName ?? "—"}
              caption={activeMembershipCaption}
              accentColor="blue"
            />
            <StatCard
              icon={AlertCircle}
              label="Outstanding"
              value={
                outstanding && Number(outstanding) > 0
                  ? `LKR ${Number(outstanding).toLocaleString()}`
                  : "Settled"
              }
              caption={
                outstanding && Number(outstanding) > 0
                  ? "Action required"
                  : "All clear"
              }
              accentColor={
                outstanding && Number(outstanding) > 0 ? "red" : "green"
              }
            />
            <StatCard
              icon={Activity}
              label="Total check-ins"
              value={totalCheckins}
              caption="Lifetime"
              accentColor="amber"
            />
          </div>

          {/* Payments */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">Payments</h3>
              <RecordPaymentButton
                memberId={member.id}
                currentMembershipId={current?.id ?? null}
              />
            </div>
            <PaymentsTable
              rows={paymentRows}
              refundedReferences={refundedReferences}
            />
          </div>

          {/* Attendance */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Attendance (last 30)</h3>
            <AttendanceTable rows={attendanceRows} />
          </div>

          {/* Membership history */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Membership history</h3>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-6"
                      >
                        No memberships yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.planName}</TableCell>
                      <TableCell>
                        {format(new Date(h.startDate), "PP")}
                      </TableCell>
                      <TableCell>{format(new Date(h.endDate), "PP")}</TableCell>
                      <TableCell>
                        <StatusPill variant={h.status}>{h.status}</StatusPill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </AdminPage>
    );
  }
  ```

  **About `totalCheckins`:** the snippet above uses a placeholder query (`select() from attendance where memberId=id` and counts rows). A cleaner version uses `count()`:

  Replace the totalCheckins block with:

  ```tsx
  import { count } from "drizzle-orm";
  // ... in the function body:
  const [{ value: totalCheckins }] = await db
    .select({ value: count() })
    .from(attendance)
    .where(eq(attendance.memberId, id));
  ```

  And add `count` to the import at the top of the file: `import { eq, desc, count } from "drizzle-orm";`.

- [ ] **Step 2: Restyle `_payments-table.tsx`**

  Open `src/app/admin/members/[id]/_payments-table.tsx`. Find every `<Badge variant="...">` for status display and replace with `<StatusPill variant={p.status}>{p.status}</StatusPill>`. Add `import { StatusPill } from "@/components/admin/status-pill";` at the top.

  If the file uses inline color classes (`text-red-600`, etc.) for amounts or other indicators, leave those alone — only swap status badges.

- [ ] **Step 3: Restyle `_attendance-table.tsx`**

  Open `src/app/admin/members/[id]/_attendance-table.tsx`. Most attendance rows don't have a status pill (just timestamps). If a `<Badge>` is used for the source label (kiosk_id / qr_scan / manual), leave it — it's a non-status badge. Add the wrapping `<div className="rounded-lg border bg-card">` around the `<Table>` to match the new card-style look used elsewhere.

  Concretely: find `<Table>` near the top of the returned JSX, wrap it in `<div className="rounded-lg border bg-card">...</div>`.

- [ ] **Step 4: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 5: Run the test suite**

  ```powershell
  npm test
  ```

  Expected: 233 still pass.

- [ ] **Step 6: Manual smoke**

  ```powershell
  npm run dev
  ```

  Visit any member detail page. Expect: breadcrumb "Members › <name>", member name + status pill at top, 4 stat cards in a grid, then Payments table, Attendance table, Membership history. Ctrl+C when done.

- [ ] **Step 7: Commit**

  ```powershell
  git add src/app/admin/members/[id]/
  git commit -m "feat(admin-ui): restyle member detail with stat cards + breadcrumbs"
  ```

---

## Task 8: Auth pages — branded card chrome around Clerk

**Why:** Sign-in and sign-up currently render bare `<SignIn>` / `<SignUp>` centered on a blank page. Replace with a branded layout that puts the form in a card with the gym logo above. Dark theme via the `appearance` prop.

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- Modify: `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Rewrite `(auth)/layout.tsx`**

  ```tsx
  import Link from "next/link";

  // Same theme-init script as admin layout — apply dark by default unless
  // localStorage says otherwise.
  const themeInitScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light') document.documentElement.classList.add('dark');
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  })();
  `;

  export default function AuthLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
        <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-12">
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            <Link href="/" className="text-center">
              <div className="text-xl font-semibold tracking-tight">
                Muscle Factory Gym
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Member portal
              </div>
            </Link>
            {children}
          </div>
        </main>
      </>
    );
  }
  ```

- [ ] **Step 2: Update `(auth)/sign-in/[[...sign-in]]/page.tsx`**

  ```tsx
  import { SignIn } from "@clerk/nextjs";

  export default function Page() {
    return (
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-card border border-border shadow-lg",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton:
              "bg-background border-border text-foreground hover:bg-muted",
            socialButtonsBlockButtonText: "text-foreground",
            dividerLine: "bg-border",
            dividerText: "text-muted-foreground",
            formFieldLabel: "text-foreground",
            formFieldInput:
              "bg-input border-border text-foreground",
            formButtonPrimary:
              "bg-primary hover:bg-primary/90 text-primary-foreground",
            footerActionLink: "text-primary hover:text-primary/80",
            identityPreviewText: "text-foreground",
            identityPreviewEditButton: "text-primary",
          },
        }}
      />
    );
  }
  ```

- [ ] **Step 3: Update `(auth)/sign-up/[[...sign-up]]/page.tsx`**

  ```tsx
  import { SignUp } from "@clerk/nextjs";

  export default function Page() {
    return (
      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-card border border-border shadow-lg",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton:
              "bg-background border-border text-foreground hover:bg-muted",
            socialButtonsBlockButtonText: "text-foreground",
            dividerLine: "bg-border",
            dividerText: "text-muted-foreground",
            formFieldLabel: "text-foreground",
            formFieldInput:
              "bg-input border-border text-foreground",
            formButtonPrimary:
              "bg-primary hover:bg-primary/90 text-primary-foreground",
            footerActionLink: "text-primary hover:text-primary/80",
          },
        }}
      />
    );
  }
  ```

- [ ] **Step 4: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 5: Manual smoke**

  ```powershell
  npm run dev
  ```

  Visit `/sign-in` and `/sign-up` while signed out. Expect: dark page background, "Muscle Factory Gym" branding above a dark-themed Clerk form. The form's interactive elements should be readable on dark (white text on dark inputs).

  Ctrl+C when done.

- [ ] **Step 6: Commit**

  ```powershell
  git add src/app/(auth)/
  git commit -m "feat(admin-ui): branded dark theme for /sign-in and /sign-up"
  ```

---

## Task 9: Public landing page

**Why:** Replace the placeholder "Gym Management + Sign in/Sign up buttons" with a real public landing page: hero + plans pricing + CTAs.

**Files:**
- Replace: `src/app/page.tsx`

- [ ] **Step 1: Replace `src/app/page.tsx`**

  ```tsx
  import Link from "next/link";
  import { redirect } from "next/navigation";
  import { db } from "@/db";
  import { plans } from "@/db/schema";
  import { eq, asc } from "drizzle-orm";
  import { buttonVariants } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { getCurrentUser } from "@/lib/auth";

  // Same theme-init script as admin/auth — apply dark by default.
  const themeInitScript = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light') document.documentElement.classList.add('dark');
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  })();
  `;

  export default async function Home() {
    const u = await getCurrentUser();
    if (u) {
      redirect(u.role === "admin" ? "/admin" : "/portal");
    }

    let planList: { id: string; name: string; durationDays: number; priceLkr: string }[] = [];
    try {
      planList = await db
        .select({
          id: plans.id,
          name: plans.name,
          durationDays: plans.durationDays,
          priceLkr: plans.priceLkr,
        })
        .from(plans)
        .where(eq(plans.isActive, true))
        .orderBy(asc(plans.durationDays));
    } catch (err) {
      console.warn(`[landing] plans query failed: ${err}`);
    }

    return (
      <>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
        <main className="min-h-screen bg-background text-foreground">
          {/* Top bar */}
          <header className="border-b">
            <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
              <div className="font-semibold tracking-tight">
                Muscle Factory Gym
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/sign-in"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={buttonVariants({ size: "sm" })}
                >
                  Join now
                </Link>
              </div>
            </div>
          </header>

          {/* Hero */}
          <section className="max-w-6xl mx-auto px-4 md:px-6 py-20 md:py-28 text-center">
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight">
              Train hard.{" "}
              <span className="text-primary">Track everything.</span>
            </h1>
            <p className="text-muted-foreground text-lg mt-6 max-w-xl mx-auto">
              Membership management, attendance tracking, and online payments
              for our gym &mdash; all in one portal.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg" })}
              >
                Become a member
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Member sign in
              </Link>
            </div>
          </section>

          {/* Plans */}
          {planList.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 border-t">
              <div className="text-center mb-10">
                <h2 className="text-2xl md:text-3xl font-semibold">
                  Membership plans
                </h2>
                <p className="text-muted-foreground mt-2">
                  Pick the plan that fits your routine.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {planList.map((p) => (
                  <Card key={p.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-3xl font-semibold tabular-nums">
                        LKR {Number(p.priceLkr).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {p.durationDays}-day access
                      </div>
                      <Link
                        href="/sign-up"
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                          className: "w-full mt-3",
                        })}
                      >
                        Join
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="border-t mt-16">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-2">
              <div>© Muscle Factory Gym</div>
              <div className="flex gap-4">
                <Link href="/sign-in" className="hover:text-foreground">
                  Sign in
                </Link>
                <Link href="/sign-up" className="hover:text-foreground">
                  Sign up
                </Link>
              </div>
            </div>
          </footer>
        </main>
      </>
    );
  }
  ```

- [ ] **Step 2: Verify build**

  ```powershell
  npm run build
  ```

  Expected: success.

- [ ] **Step 3: Manual smoke**

  ```powershell
  npm run dev
  ```

  Visit `/` while signed out. Expect: dark page, top bar with brand + sign-in/join CTAs, hero block with primary CTA, plans grid (if any active plans exist in DB), footer.

  If signed in, you should be redirected to `/admin` or `/portal`.

  Ctrl+C when done.

- [ ] **Step 4: Commit**

  ```powershell
  git add src/app/page.tsx
  git commit -m "feat(admin-ui): polished public landing page with hero + plans + CTAs"
  ```

---

## Task 10: End-to-end smoke + Phase 7 tag

**Why:** Verify the full Phase 7 surface end-to-end locally, then tag.

- [ ] **Step 1: Run the full suite**

  ```powershell
  npm test
  ```

  Expected: 233 tests pass across 46 files (223 baseline + 6 component + 4 search route).

- [ ] **Step 2: Production build**

  ```powershell
  npm run build
  ```

  Expected: success. New route `/api/admin/search-members` should appear in the route table.

- [ ] **Step 3: cf:build**

  If `.open-next/worker.js` exists from a prior run, the build may fail with "Unused @ts-expect-error" errors in `src/worker-with-scheduled.ts`. Clear first:

  ```powershell
  rm -rf .open-next
  npm run cf:build
  ```

  Expected: success.

- [ ] **Step 4: Verify wrangler bundles**

  ```powershell
  npx wrangler deploy --dry-run --outdir tmp-wrangler-out
  ```

  Expected: success. Then clean up:

  ```powershell
  rm -rf tmp-wrangler-out
  ```

- [ ] **Step 5: Manual end-to-end walkthrough**

  ```powershell
  npm run dev
  ```

  Walk through every redesigned surface:

  1. **Signed-out `/`** — dark, hero, plans grid (if seeded), CTAs.
  2. **`/sign-in`** — branded dark card with Clerk form.
  3. **`/sign-up`** — same shape.
  4. Sign in as an admin.
  5. **`/admin`** — dashboard with 4 stat cards + 2 panels, sidebar active=Dashboard, breadcrumb "Dashboard".
  6. **`/admin/members`** — list with status pills (green/red/amber); page filter still works; breadcrumb "Members".
  7. Click any member → **`/admin/members/[id]`** — breadcrumb "Members › <name>", 4 stat cards top, Payments + Attendance + Membership history tables.
  8. **`/admin/pending`** — restyled queue; breadcrumb "Pending".
  9. **`/admin/plans`** — restyled CRUD; breadcrumb "Plans".
  10. **`/admin/reports`** — restyled tables; breadcrumb "Reports".
  11. **Theme toggle** — click sun/moon → flips light. Reload — preference persists.
  12. **Theme toggle again** — flip back to dark.
  13. **Header search** — type 3 letters of a member's name → dropdown → click → jumps to member detail.
  14. Sign out → back to `/`.
  15. Sign in as a **member** (not admin) — should land on `/portal` (UNCHANGED light theme — verify no regression).
  16. Visit `/checkin` (public route) — UNCHANGED. No regression.

  If any of these fail, fix before tagging.

  Ctrl+C when done.

- [ ] **Step 6: Tag the milestone**

  ```powershell
  git tag phase-7
  ```

  Do NOT push without explicit user authorization (Phase 3, 4, 5, 6 are also unpushed).

- [ ] **Step 7: Update project memory**

  Update `C:\Users\User\.claude\projects\D--business-projects-Gym-management-system\memory\project_gym_management.md` with a Phase 7 status block. Include:

  - Tag `phase-7` at the green HEAD.
  - What shipped: shared admin components (Sidebar, TopBar, Breadcrumbs, ThemeToggle, StatCard, StatusPill, MemberSearch, dashboard panels), recolored dark palette, new `/admin` dashboard, restyled `/admin/members/*`, `/admin/pending`, `/admin/plans`, `/admin/reports`, new `/api/admin/search-members` endpoint, branded auth pages, polished landing page. 10 new tests, ~233 total.
  - What's deferred: portal/kiosk redesign, mobile hamburger polish, screenshot tests, gym logo image (text-only for now), cmd+K palette, search by phone, trend deltas on dashboard cards.
  - Note that `/portal` and `/checkin` are intentionally light + unchanged.
  - Theme-init inline `<script>` is in admin/auth/landing layouts; portal and kiosk layouts do NOT include it.

---

## Self-Review

**Spec coverage:**

| Design section                                          | Covered by   |
| ------------------------------------------------------- | ------------ |
| §2 Architecture (token layer, layout chrome, pages)     | Tasks 1, 4, 5–9 |
| §3 File layout                                          | Task 0 (dirs) + Tasks 1–9 |
| §4.1 Dark palette tokens                                | Task 1       |
| §4.2 Semantic status color tokens                       | Task 1       |
| §5.1 `<Sidebar>`                                        | Task 2 step 7|
| §5.2 `<TopBar>`                                         | Task 2 step 8|
| §5.3 `<Breadcrumbs>`                                    | Task 2 step 4|
| §5.4 `<ThemeToggle>`                                    | Task 2 step 5|
| §5.5 `<MemberSearch>`                                   | Task 3       |
| §5.6 `<StatCard>`                                       | Task 2 step 6|
| §5.7 `<StatusPill>`                                     | Task 2 step 3|
| §5.8 `<RecentPaymentsPanel>` / `<RecentCheckinsPanel>`  | Task 5       |
| §6.1 Dashboard data flow (6 parallel queries)           | Task 5       |
| §6.2 Global header search flow                          | Task 3       |
| §6.3 Theme toggle flow                                  | Task 2 step 5 + Task 4 step 2 (theme-init script) |
| §6.4 Member detail page reorg                           | Task 7       |
| §7 Error handling (every row in the table)              | Inline in Tasks 3, 5; manual smoke in Task 10 |
| §8.1 Component tests (StatusPill 4 + Breadcrumbs 2)     | Task 2       |
| §8.2 Route handler tests (search-members 4)             | Task 3       |
| §8.3 Manual visual smoke                                | Task 10 step 5 |
| §9 Done criteria                                        | Task 10      |
| §10 Deferrals                                           | Documented; not implemented |

**Placeholder scan:** No "TBD", "TODO", or "similar to" — every step has runnable code or commands. The Task 7 step on `totalCheckins` calls out the cleaner `count()` approach explicitly and provides the corrected import + query. Task 2 step 8 explicitly creates a stub `MemberSearch` and notes Task 3 replaces it — that's an inter-task dependency note, not a placeholder.

**Type consistency:**

- `StatusVariant` from Task 2 (`paid | succeeded | active | unpaid | failed | inactive | refunded | pending | expired | cancelled`) is used by Task 5 (`RecentPayment.status`), Task 6 (members status), Task 7 (member status + membership status).
- `BreadcrumbItem` from Task 2 is used by every page wrapping in `<AdminPage breadcrumbs={[...]}>` (Tasks 5, 6, 7).
- `StatCardAccent` (`red | green | amber | blue | default`) — consumers in Tasks 5, 7 use only these literal strings.
- `RecentPayment` and `RecentCheckin` types are co-located with their panels (Task 5) and consumed only by `/admin/page.tsx` (same task).
- The theme-init `<script>` is exactly the same string in Tasks 4, 8, 9 (admin layout, auth layout, landing page).
- All new route handlers export `GET` (one in Task 3) or `POST` (none in this phase, all existing cron routes untouched).
- `Mailer`, `decideReminder`, etc. from Phase 6 are untouched.

**Naming consistency:**

- All new admin components live in `src/components/admin/`.
- All test files live under `tests/components/` or `tests/app/api/`.
- All `_*Unsafe` patterns from prior phases are untouched.

Verified consistent.

---

*Ready for execution. Recommended next step: invoke `superpowers:subagent-driven-development` to dispatch tasks one-at-a-time with review between each commit.*
