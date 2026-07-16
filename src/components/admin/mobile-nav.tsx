"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavItems } from "./nav-items";
import { StorageMeter } from "./storage-meter";
import type { DbUsage } from "@/lib/admin/db-usage";

export function MobileNav({
  pendingCount,
  usage,
}: {
  pendingCount?: number;
  usage?: DbUsage | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change so tapping a link dismisses the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center size-9 rounded-md hover:bg-accent text-foreground"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop dismisses on tap; fades in under the sheet. */}
          <div
            className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Bottom sheet: slides UP from the bottom edge with a drag handle
              and rounded top corners — the mobile-app menu pattern (Apple
              Music / storefront drawers). Tapping the handle or backdrop
              dismisses it. Storage meter anchors the footer. */}
          <aside
            role="dialog"
            aria-modal="true"
            className="dark absolute inset-x-0 bottom-0 rounded-t-2xl bg-sidebar text-sidebar-foreground border-t border-sidebar-border flex flex-col shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
          >
            {/* Drag handle — also a tap target to close. */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="mx-auto mt-3 mb-1 flex h-6 w-16 items-center justify-center shrink-0"
            >
              <span className="h-1.5 w-10 rounded-full bg-sidebar-foreground/25" />
            </button>
            <NavItems variant="sheet" pendingCount={pendingCount} />
            {usage && <StorageMeter {...usage} />}
          </aside>
        </div>
      )}
    </>
  );
}
