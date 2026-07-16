"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Tag,
  BarChart3,
  ChevronRight,
  Loader2,
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

// Renders the icon + label + (optional badge) + trailing indicator. Must be a
// child of <Link> because useLinkStatus() reads pending state from the
// enclosing Link, giving us instant visual feedback before the server even
// starts rendering.
function NavLinkContents({
  active,
  Icon,
  label,
  badge,
  large = false,
}: {
  active: boolean;
  Icon: LucideIcon;
  label: string;
  badge?: number;
  large?: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      <Icon className={cn("shrink-0", large ? "size-5" : "size-4")} />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums">
          {badge}
        </span>
      )}
      {pending ? (
        <Loader2
          className={cn("shrink-0 animate-spin", large ? "size-5" : "size-4")}
        />
      ) : (
        <ChevronRight
          className={cn(
            "shrink-0",
            large ? "size-5" : "size-4",
            active ? "opacity-100" : "opacity-40",
          )}
        />
      )}
    </>
  );
}

export function NavItems({
  onNavigate,
  pendingCount,
  variant = "sidebar",
}: {
  onNavigate?: () => void;
  pendingCount?: number;
  /** "sidebar": compact rows (desktop rail). "sheet": large, full-width
   *  rows with dividers for the mobile bottom-sheet menu. */
  variant?: "sidebar" | "sheet";
}) {
  const pathname = usePathname();
  const sheet = variant === "sheet";
  return (
    <nav
      className={cn(
        "flex flex-col",
        sheet ? "px-1 py-1" : "flex-1 px-3 py-4 gap-1",
      )}
    >
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        const badge =
          item.href === "/admin/pending" ? pendingCount : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            prefetch
            className={cn(
              "relative flex items-center transition-colors",
              sheet
                ? cn(
                    "gap-4 px-5 py-4 text-base font-semibold tracking-wide uppercase border-b border-sidebar-border/60 last:border-b-0",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
                  )
                : cn(
                    "gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  ),
            )}
          >
            <NavLinkContents
              active={active}
              Icon={item.icon}
              label={item.label}
              badge={badge}
              large={sheet}
            />
          </Link>
        );
      })}
    </nav>
  );
}
