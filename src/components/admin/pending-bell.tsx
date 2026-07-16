import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Notifications bell for the admin top bar. Surfaces the pending-member
 * count (the owner's most time-sensitive task) from any admin page and
 * links straight to /admin/pending. The count is already fetched in the
 * top bar, so this is a pure presentational badge.
 */
export function PendingBell({ count = 0 }: { count?: number }) {
  const has = count > 0;
  return (
    <Button
      variant="outline"
      size="icon"
      render={<Link href="/admin/pending" />}
      aria-label={
        has
          ? `${count} member${count === 1 ? "" : "s"} awaiting approval`
          : "No members awaiting approval"
      }
      title={has ? `${count} pending approval${count === 1 ? "" : "s"}` : "Pending approvals"}
      className="relative rounded-full"
    >
      <Bell className="size-4" />
      {has && (
        <span className="absolute -top-1 -right-1 inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold leading-none text-primary-foreground tabular-nums ring-2 ring-card">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );
}
