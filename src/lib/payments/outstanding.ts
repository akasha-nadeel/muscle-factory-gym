export type PaymentForOutstanding = {
  id: string;
  amountLkr: string; // numeric string from Drizzle
  kind: "membership" | "admission";
  status: "pending" | "succeeded" | "failed" | "refunded";
  membershipId: string | null;
};

/**
 * Outstanding = planPrice - sum(payments where kind='membership',
 * status IN ('succeeded', 'refunded'), membershipId matches).
 * Clamped to >= 0. Refunds contribute via their negative amountLkr.
 */
export function computeOutstanding(input: {
  planPriceLkr: string;
  payments: PaymentForOutstanding[];
  membershipId: string;
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
  const outstanding = planPrice - paid;
  return (outstanding > 0 ? outstanding : 0).toFixed(2);
}
