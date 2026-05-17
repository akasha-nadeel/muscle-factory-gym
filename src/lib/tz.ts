/**
 * Sri Lanka is UTC+5:30, no DST. We shift UTC by this offset, then read the
 * UTC-getters on the shifted Date so the runtime's local timezone is ignored.
 * Works identically on Windows dev (SLT) and Vercel runtime (UTC).
 */
const SL_OFFSET_MIN = 5 * 60 + 30;

function shiftToSL(d: Date): Date {
  return new Date(d.getTime() + SL_OFFSET_MIN * 60_000);
}

/** Returns YYYY-MM-DD for the given instant, in Sri Lanka local time. */
export function todayInSL(now: Date = new Date()): string {
  const sl = shiftToSL(now);
  const yyyy = sl.getUTCFullYear();
  const mm = String(sl.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(sl.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns YYYY-MM for the given instant, in Sri Lanka local time. */
export function slMonthOf(d: Date): string {
  const sl = shiftToSL(d);
  const yyyy = sl.getUTCFullYear();
  const mm = String(sl.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
