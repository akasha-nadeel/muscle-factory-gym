import { daysRemaining } from "@/lib/days-remaining";
import { getCurrentMembership } from "@/lib/memberships/current";

export type EvaluateMember = {
  id: string;
  fullName: string;
  status: "pending" | "active" | "inactive";
  photoUrl: string | null;
  gymId: number | null;
};

export type EvaluateMembership = {
  id: string;
  status: "active" | "expired" | "cancelled";
  startDate: string;
  endDate: string;
  planName: string;
};

export type EvaluateAttendance = {
  id: string;
  checkedInAt: string | Date;
};

export type CheckinRejectReason =
  | "not_found"
  | "pending_approval"
  | "inactive"
  | "no_active_membership"
  | "already_checked_in_today";

export type CheckinResult =
  | {
      ok: true;
      member: {
        memberId: string;
        fullName: string;
        photoUrl: string | null;
        gymId: number | null;
        planName: string;
        expiresOn: string;
        daysRemaining: number;
        membershipId: string;
      };
    }
  | { ok: false; reason: CheckinRejectReason };

export function evaluateCheckin(input: {
  member: EvaluateMember | null;
  memberships: EvaluateMembership[];
  todayAttendance: EvaluateAttendance[];
  todaySL: string; // YYYY-MM-DD
}): CheckinResult {
  const { member, memberships, todayAttendance, todaySL } = input;

  if (!member) return { ok: false, reason: "not_found" };
  if (member.status === "pending") {
    return { ok: false, reason: "pending_approval" };
  }
  if (member.status === "inactive") return { ok: false, reason: "inactive" };

  const current = getCurrentMembership(memberships, todaySL);
  if (!current) return { ok: false, reason: "no_active_membership" };

  if (todayAttendance.length > 0) {
    return { ok: false, reason: "already_checked_in_today" };
  }

  return {
    ok: true,
    member: {
      memberId: member.id,
      fullName: member.fullName,
      photoUrl: member.photoUrl,
      gymId: member.gymId,
      planName: current.planName,
      expiresOn: current.endDate,
      daysRemaining: daysRemaining({ today: todaySL, endDate: current.endDate }),
      membershipId: current.id,
    },
  };
}
