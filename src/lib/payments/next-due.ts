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

export function addOneCycle(date: Date, cycle: CyclePeriod): Date {
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

/**
 * The most recent due date that has already passed (today >= due_date).
 * Returns null if the member is still in their first cycle (no due
 * date has come up yet).
 *
 * Used for the kiosk warning copy: when a member is overdue, this is
 * the date the payment was supposed to be made by.
 */
export function computeLastMissedDueDate(input: {
  membershipStart: string;
  cyclePeriod: CyclePeriod;
  today: string;
}): string | null {
  const start = parseISO(input.membershipStart);
  const today = parseISO(input.today);
  if (isBefore(today, start)) return null;
  let last: Date | null = null;
  let due = addOneCycle(start, input.cyclePeriod);
  while (!isBefore(today, due)) {
    last = due;
    due = addOneCycle(due, input.cyclePeriod);
  }
  return last ? format(last, "yyyy-MM-dd") : null;
}

/**
 * How many billing cycles have started by `today` for a membership that
 * began on `membershipStart`. The first cycle counts the moment the
 * member signs up — so on Day 1, this returns 1. On the first calendar
 * anniversary (next-due day), it ticks up to 2, and so on.
 *
 * Used to compute cycle-aware outstanding: expected total = cycles * plan_price.
 */
export function countCyclesElapsed(input: {
  membershipStart: string; // YYYY-MM-DD
  cyclePeriod: CyclePeriod;
  today: string; // YYYY-MM-DD
}): number {
  const start = parseISO(input.membershipStart);
  const today = parseISO(input.today);
  if (isBefore(today, start)) return 0; // membership hasn't started yet
  let count = 1;
  let next = addOneCycle(start, input.cyclePeriod);
  while (!isBefore(today, next)) {
    count++;
    next = addOneCycle(next, input.cyclePeriod);
  }
  return count;
}
