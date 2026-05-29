"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
  type TransitionStartFunction,
} from "react";
import { Loader2 } from "lucide-react";

/**
 * Lifts useTransition state to a Provider so MemberFilters (sibling above)
 * can share its pending state with the ListArea (sibling below). Without
 * this, useTransition's pending lives in the filter only, and there's no
 * way to dim/spinner the server-rendered list when navigating.
 *
 * Pattern matches Linear / Stripe filtered-list UIs: filter feels instant
 * (useOptimistic active state) AND the list area gets a clear visual
 * "we're updating" affordance.
 */

type Ctx = {
  pending: boolean;
  startTransition: TransitionStartFunction;
};

const PendingContext = createContext<Ctx | null>(null);

export function NavPendingProvider({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return (
    <PendingContext.Provider value={{ pending, startTransition }}>
      {children}
    </PendingContext.Provider>
  );
}

export function useNavPending(): Ctx {
  const ctx = useContext(PendingContext);
  // Default no-op so the hook is safe outside the provider (e.g. SSR shells).
  return (
    ctx ?? {
      pending: false,
      startTransition: ((cb: () => void) => cb()) as TransitionStartFunction,
    }
  );
}

/**
 * Wraps the members list area. Dims content + shows a centered spinner
 * while the shared transition is pending. The dim + spinner overlay is
 * the universal "this area is reloading" affordance — same as Stripe
 * Dashboard, Vercel Analytics, Linear list filters.
 */
export function ListArea({ children }: { children: ReactNode }) {
  const { pending } = useNavPending();
  return (
    <div className="relative">
      <div
        className={
          pending
            ? "opacity-40 pointer-events-none transition-opacity"
            : "transition-opacity"
        }
        aria-busy={pending}
      >
        {children}
      </div>
      {pending && (
        <div className="absolute inset-0 flex items-start justify-center pt-12 pointer-events-none">
          <div className="size-10 rounded-full bg-card/80 backdrop-blur-sm border shadow-md flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}
