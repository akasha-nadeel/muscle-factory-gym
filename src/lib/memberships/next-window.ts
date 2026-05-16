import { addDays, format, parseISO } from "date-fns";

export type NextWindowInput = {
  today: string; // YYYY-MM-DD
  durationDays: number; // positive integer
  latestActiveEndDate: string | null; // YYYY-MM-DD or null
};

export type NextWindowResult = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive last day)
};

/**
 * For a new membership being added on `today`:
 *  - If no prior active membership: start = today.
 *  - If prior active membership ends in the future (or today): start = prior.end + 1.
 *  - If prior active membership already ended (before today): start = today.
 * end = start + durationDays - 1 (inclusive).
 */
export function computeNextMembershipWindow(
  input: NextWindowInput,
): NextWindowResult {
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
    throw new Error("durationDays must be a positive integer");
  }
  const today = parseISO(input.today);
  let start = today;
  if (input.latestActiveEndDate) {
    const prevEnd = parseISO(input.latestActiveEndDate);
    if (prevEnd >= today) start = addDays(prevEnd, 1);
  }
  const end = addDays(start, input.durationDays - 1);
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
  };
}
