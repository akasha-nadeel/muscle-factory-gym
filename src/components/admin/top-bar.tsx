import { UserButton } from "@clerk/nextjs";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { MemberSearch } from "./member-search";
import { MobileNav } from "./mobile-nav";
import { getPendingMemberCount } from "@/lib/admin/pending-count";

export async function TopBar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  const pendingCount = await getPendingMemberCount();
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      {/* Row 1 — nav + breadcrumb + icons. On desktop the search lives
          here too; on mobile it drops to its own row below to avoid
          cramming five items into a 360px-wide bar. */}
      <div className="h-14 flex items-center px-3 md:px-6 gap-2 md:gap-4">
        <MobileNav pendingCount={pendingCount} />
        <div className="min-w-0 flex-1">
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <MemberSearch />
          </div>
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
      {/* Row 2 (mobile only) — full-width member search so admins can
          jump to any member with one tap, matching the desktop affordance.
          Standard mobile-app pattern (Linear, Twitter, Gmail). */}
      <div className="sm:hidden px-3 pb-2.5">
        <MemberSearch />
      </div>
    </header>
  );
}
