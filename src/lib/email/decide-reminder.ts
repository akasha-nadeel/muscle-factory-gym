import { differenceInCalendarDays, parseISO, format } from "date-fns";

export type ReminderKind = "3d" | "1d" | "overdue";

export type DecideMember = {
  status: "active" | "pending" | "inactive";
  role: "admin" | "member";
};

export type DecideMembership = {
  status: "active" | "expired" | "cancelled";
  endDate: string; // YYYY-MM-DD
  reminder3dSentAt: Date | null;
  reminder1dSentAt: Date | null;
  lastOverdueReminderAt: Date | null;
};

export type DecideResult =
  | { kind: ReminderKind }
  | { kind: null; reason: string };

/**
 * Decide which reminder (if any) to send for a member.
 *
 * Priority order:
 *  - member inactive/pending or admin → null
 *  - no memberships → null
 *  - cancelled membership → null
 *  - active membership, 1 day remaining (or 0 = endDate today, defensive),
 *    1d stamp null → '1d'  (priority over 3d when in overlap)
 *  - active membership, 2-3 days remaining, 3d stamp null → '3d'
 *  - expired membership, no overdue stamp today → 'overdue'
 *  - otherwise → null
 */
export function decideReminder(
  member: DecideMember,
  latestMembership: DecideMembership | null,
  todaySL: string,
): DecideResult {
  if (member.status !== "active" || member.role !== "member") {
    return { kind: null, reason: "member_not_active" };
  }
  if (latestMembership === null) {
    return { kind: null, reason: "no_membership" };
  }
  if (latestMembership.status === "cancelled") {
    return { kind: null, reason: "cancelled" };
  }

  const today = parseISO(todaySL);
  const end = parseISO(latestMembership.endDate);
  const daysRemaining = differenceInCalendarDays(end, today);

  if (latestMembership.status === "active") {
    // 1d priority (covers daysRemaining = 0 and 1)
    if (daysRemaining <= 1 && daysRemaining >= 0) {
      if (latestMembership.reminder1dSentAt === null) {
        return { kind: "1d" };
      }
      return { kind: null, reason: "1d_already_sent" };
    }
    // 3d window covers 2-3 days for catch-up
    if (daysRemaining >= 2 && daysRemaining <= 3) {
      if (latestMembership.reminder3dSentAt === null) {
        return { kind: "3d" };
      }
      return { kind: null, reason: "3d_already_sent" };
    }
    return { kind: null, reason: "too_early" };
  }

  if (latestMembership.status === "expired") {
    const stamp = latestMembership.lastOverdueReminderAt;
    if (stamp === null) return { kind: "overdue" };
    const stampDay = format(stamp, "yyyy-MM-dd");
    if (stampDay < todaySL) return { kind: "overdue" };
    return { kind: null, reason: "overdue_already_sent_today" };
  }

  return { kind: null, reason: "unhandled" };
}
