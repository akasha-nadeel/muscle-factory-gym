import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { MemberSearch } from "./member-search";
import { MobileNav } from "./mobile-nav";
import { PendingBell } from "./pending-bell";
import { AccountPill } from "@/components/account-pill";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import { getPendingMemberCount } from "@/lib/admin/pending-count";
import { getDatabaseUsage } from "@/lib/admin/get-db-usage";

export async function TopBar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  const [pendingCount, usage, clerkUser] = await Promise.all([
    getPendingMemberCount(),
    getDatabaseUsage().catch(() => null),
    currentUser().catch(() => null),
  ]);

  // Identity for the header pill — mirrors the portal: live Clerk name +
  // avatar, with the email's local part as an "@handle" subtitle.
  const clerkFullName =
    [clerkUser?.firstName, clerkUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || null;
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const name = displayName(clerkFullName ?? email);
  const avatarUrl = normalizeAvatarUrl(clerkUser?.imageUrl);
  const handle = email ? `@${email.split("@")[0]}` : "Admin";
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      {/* Row 1 — nav + breadcrumb + icons. On desktop the search lives
          here too; on mobile it drops to its own row below to avoid
          cramming five items into a 360px-wide bar. */}
      <div className="h-14 flex items-center px-3 md:px-6 gap-3 md:gap-4">
        <MobileNav pendingCount={pendingCount} usage={usage} />
        {/* Page title, left. Natural width on desktop so the search can
            claim the middle; grows to fill on mobile (search hidden there). */}
        <div className="min-w-0 flex-1 sm:flex-none shrink-0">
          <Breadcrumbs items={breadcrumbs} />
        </div>
        {/* Member search fills the middle (capped width, centred), instead of
            floating jammed against the account on the far right. */}
        <div className="hidden sm:flex flex-1 min-w-0 justify-center">
          <div className="w-full max-w-md">
            <MemberSearch />
          </div>
        </div>
        {/* Right-anchored utility + account group. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Kiosk launcher. Outlined circle rather than a ghost icon so it
              reads as an action, with the avatar anchoring the end. prefetch
              is off because /checkin is force-dynamic and mints a fresh
              signed QR token per render; prefetching would burn a token
              nobody scans. */}
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
          <PendingBell count={pendingCount} />
          <AccountPill
            name={name}
            subtitle={handle}
            email={email}
            imageUrl={avatarUrl}
          />
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
