import { addDays, addMonths, addYears, format, isBefore, parseISO } from "date-fns";

export type CyclePeriod = "daily" | "monthly" | "quarterly" | "yearly";

/**
 * Maps a human-readable plan name to its billing cycle. Case-insensitive
 * substring match. Defaults to "monthly" for anything unrecognized so
 * custom plans don't crash the system — admin can rename or we can later
 * add a `cycle_period` enum column to the plans table.
 */
export function inferCyclePeriod(planName: string): CyclePeriod {
  const n = planName.toLowerCase();
  if (n.includes("year") || n.includes("annual")) return "yearly";
  if (n.includes("quarter") || n.includes("3 month")) return "quarterly";
  if (n.includes("daily") || n.includes("day pass")) return "daily";
  return "monthly";
}

function addOneCycle(date: Date, cycle: CyclePeriod): Date {
  switch (cycle) {
    case "daily":
      return addDays(date, 1);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "yearly":
      return addYears(date, 1);
  }
}

/**
 * The next date the member owes a payment. Calendar-aware:
 *  - Monthly:   Oct 5  → Nov 5   (date-fns clamps end-of-month: Jan 31 → Feb 28/29)
 *  - Quarterly: Oct 5  → Jan 5
 *  - Yearly:    Oct 5  → Oct 5 next year
 *  - Daily:     Oct 5  → Oct 6
 *
 * Algorithm: start from membershipStart, step forward one cycle at a
 * time until the date is on or after today. That handles the case where
 * a member missed several cycles — we always show the NEXT upcoming due,
 * not the original one that's long past.
 *
 * Returns YYYY-MM-DD string.
 */
export function computeNextPaymentDue(input: {
  membershipStart: string; // YYYY-MM-DD
  cyclePeriod: CyclePeriod;
  today: string; // YYYY-MM-DD
}): string {
  const start = parseISO(input.membershipStart);
  const today = parseISO(input.today);
  let due = addOneCycle(start, input.cyclePeriod);
  while (isBefore(due, today)) {
    due = addOneCycle(due, input.cyclePeriod);
  }
  return format(due, "yyyy-MM-dd");
}
