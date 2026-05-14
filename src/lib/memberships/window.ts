import { addDays, format, parseISO } from "date-fns";

export type WindowInput = {
  today: string; // YYYY-MM-DD
  durationDays: number; // positive integer
  startOn?: string; // YYYY-MM-DD, optional; clamped to >= today
};

export type WindowResult = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive last day)
};

export function computeMembershipWindow(input: WindowInput): WindowResult {
  const todayDate = parseISO(input.today);
  let startDate = todayDate;
  if (input.startOn) {
    const requested = parseISO(input.startOn);
    if (requested > todayDate) startDate = requested;
  }
  // Inclusive: a 1-day plan starting today ends today.
  const endDate = addDays(startDate, input.durationDays - 1);
  return {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  };
}
