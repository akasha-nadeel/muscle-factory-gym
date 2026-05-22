import {
  countCyclesElapsed,
  type CyclePeriod,
} from "./next-due";

export type PaymentForOutstanding = {
  id: string;
  amountLkr: string; // numeric string from Drizzle
  kind: "membership" | "admission";
  status: "pending" | "succeeded" | "failed" | "refunded";
  membershipId: string | null;
};

/** Optional context for cycle-aware (recurring) outstanding. */
export type CycleContext = {
  startDate: string; // YYYY-MM-DD, when the membership started
  today: string; // YYYY-MM-DD
  cyclePeriod: CyclePeriod;
};

/**
 * Outstanding = expectedTotal - sum(payments where kind='membership',
 * status IN ('succeeded', 'refunded'), membershipId matches).
 * Clamped to >= 0. Refunds contribute via their negative amountLkr.
 *
 * When `cycleContext` is provided, the membership is treated as recurring:
 * expectedTotal = planPrice * cycles_elapsed_so_far. So a monthly plan
 * starting May 23 with one payment of 4500 shows:
 *   - May 23 → Jun 22: cycles=1, expected=4500, outstanding=0 (Settled)
 *   - Jun 23 → Jul 22: cycles=2, expected=9000, outstanding=4500
 *   - Jul 23 → Aug 22: cycles=3, expected=13500, outstanding=9000
 *
 * Without `cycleContext` the original single-cycle math applies
 * (planPrice - paid) — preserves backward compat for tests.
 */
export function computeOutstanding(input: {
  planPriceLkr: string;
  payments: PaymentForOutstanding[];
  membershipId: string;
  cycleContext?: CycleContext;
}): string {
  const planPrice = Number(input.planPriceLkr);
  const paid = input.payments
    .filter(
      (p) =>
        p.kind === "membership" &&
        p.membershipId === input.membershipId &&
        (p.status === "succeeded" || p.status === "refunded"),
    )
    .reduce((sum, p) => sum + Number(p.amountLkr), 0);
  const cycles = input.cycleContext
    ? Math.max(
        1,
        countCyclesElapsed({
          membershipStart: input.cycleContext.startDate,
          cyclePeriod: input.cycleContext.cyclePeriod,
          today: input.cycleContext.today,
        }),
      )
    : 1;
  const expectedTotal = planPrice * cycles;
  const outstanding = expectedTotal - paid;
  return (outstanding > 0 ? outstanding : 0).toFixed(2);
}
