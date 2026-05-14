export type MembershipForCurrentCheck = {
  id: string;
  status: "active" | "expired" | "cancelled";
  startDate: string; // ISO date
  endDate: string; // ISO date
};

/**
 * "Current" membership = status='active' AND end_date >= today.
 * If multiple match, return the one with the latest end_date.
 * `today` must be a YYYY-MM-DD string in the gym's local date sense.
 */
export function getCurrentMembership<T extends MembershipForCurrentCheck>(
  rows: T[],
  today: string,
): T | null {
  const eligible = rows.filter(
    (r) => r.status === "active" && r.endDate >= today,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((latest, r) =>
    r.endDate > latest.endDate ? r : latest,
  );
}
