"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/profile", label: "Profile", icon: User },
] as const;

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm font-medium">
      {items.map((item) => {
        const active =
          item.href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 sm:px-3 py-1.5 transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
