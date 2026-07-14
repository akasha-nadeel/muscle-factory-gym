import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { MemberSearch } from "./member-search";
import { MobileNav } from "./mobile-nav";
import { getPendingMemberCount } from "@/lib/admin/pending-count";
import { getDatabaseUsage } from "@/lib/admin/get-db-usage";

export async function TopBar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  const [pendingCount, usage] = await Promise.all([
    getPendingMemberCount(),
    getDatabaseUsage().catch(() => null),
  ]);
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      {/* Row 1 — nav + breadcrumb + icons. On desktop the search lives
          here too; on mobile it drops to its own row below to avoid
          cramming five items into a 360px-wide bar. */}
      <div className="h-14 flex items-center px-3 md:px-6 gap-2 md:gap-4">
        <MobileNav pendingCount={pendingCount} usage={usage} />
        <div className="min-w-0 flex-1">
          <Breadcrumbs items={breadcrumbs} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <MemberSearch />
          </div>
          {/* Kiosk launcher. Outlined circle rather than a ghost icon so it
              reads as an action next to the ambient theme toggle, and sits
              deliberately before it — actions first, settings last, avatar
              anchoring the end. prefetch is off because /checkin is
              force-dynamic and mints a fresh signed QR token per render;
              prefetching would burn a token nobody scans. */}
          <Button
            variant="outline"
            size="icon"
            render={
              <Link
                href="/checkin"
                target="_blank"
                rel="noopener noreferrer"
                prefetch={false}
              />
            }
            aria-label="Open check-in kiosk in a new tab"
            title="Open check-in kiosk"
            className="rounded-full"
          >
            <QrCode className="size-4" />
          </Button>
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
