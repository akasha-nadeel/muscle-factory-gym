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

const SL_DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const SL_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const SL_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Colombo",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "May 23, 2026, 10:49 AM" in Sri Lanka time, regardless of server TZ. */
export function formatSLDateTime(d: Date): string {
  return SL_DATE_TIME_FMT.format(d);
}

/** "May 23, 2026" in Sri Lanka time. */
export function formatSLDate(d: Date): string {
  return SL_DATE_FMT.format(d);
}

/** "10:49 AM" in Sri Lanka time. */
export function formatSLTime(d: Date): string {
  return SL_TIME_FMT.format(d);
}

/** YYYY-01-01 of the current SL year — used for year-to-date filters. */
export function startOfSLYear(todaySL: string = todayInSL()): string {
  return `${todaySL.slice(0, 4)}-01-01`;
}

/** YYYY-MM-DD of the SL date N months before `todaySL`. Day stays the same;
 * date-fns-style end-of-month clamping isn't needed because we only feed
 * the result back into a string comparison on YYYY-MM, not a calendar walk. */
export function slDateMonthsAgo(
  monthsAgo: number,
  todaySL: string = todayInSL(),
): string {
  const [y, m, d] = todaySL.split("-").map(Number);
  // 0-indexed month math; Date wraps year automatically when m goes negative.
  const dt = new Date(Date.UTC(y, m - 1 - monthsAgo, d));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert a SL-local YYYY-MM-DD to the UTC instant of that day's 00:00 SL
 * time. Use this when filtering a `timestamptz` column in SQL. */
export function slDateToUTC(slDate: string): Date {
  return new Date(`${slDate}T00:00:00+05:30`);
}
