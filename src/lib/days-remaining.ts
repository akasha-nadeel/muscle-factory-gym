import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Whole calendar days from `today` to `endDate`, inclusive.
 * - end_date == today → 0 days remaining (last day of access).
 * - end_date == today+1 → 1 day remaining.
 * - end_date < today → negative (expired).
 */
export function daysRemaining({
  today,
  endDate,
}: {
  today: string;
  endDate: string;
}): number {
  return differenceInCalendarDays(parseISO(endDate), parseISO(today));
}
