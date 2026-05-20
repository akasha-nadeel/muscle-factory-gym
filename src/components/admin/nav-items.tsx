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
}: {
  active: boolean;
  Icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold tabular-nums">
          {badge}
        </span>
      )}
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        <ChevronRight
          className={cn(
            "size-4 shrink-0",
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
}: {
  onNavigate?: () => void;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
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
              "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            <NavLinkContents
              active={active}
              Icon={item.icon}
              label={item.label}
              badge={badge}
            />
          </Link>
        );
      })}
    </nav>
  );
}
