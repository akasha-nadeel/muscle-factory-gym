"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavItems } from "./nav-items";

export function MobileNav({ pendingCount }: { pendingCount?: number }) {
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
          {/* Backdrop covers the screen below the panel and dismisses on tap. */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Top-anchored drop-down panel.
              Senior pattern: nav drops down from the top edge (full-width)
              instead of sliding in from the side. Keeps the gym brand
              (logo + dark surface) anchored where the page header already
              sat, so the menu feels like the header expanding open. The
              slide-down animation makes the open feel intentional. */}
          <aside
            role="dialog"
            aria-modal="true"
            className="dark absolute inset-x-0 top-0 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex flex-col shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-top duration-200"
          >
            <div className="h-14 px-4 border-b border-sidebar-border flex items-center justify-between gap-2 shrink-0">
              <Image
                src="/logo.webp"
                alt="Muscle Factory Gym"
                width={180}
                height={42}
                priority
                className="h-[34px] w-auto"
              />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center size-9 rounded-md hover:bg-sidebar-accent"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavItems pendingCount={pendingCount} />
          </aside>
        </div>
      )}
    </>
  );
}
