import { describe, it, expect } from "vitest";
import { evaluateCheckin } from "@/lib/checkin/evaluate";

const baseMember = {
  id: "M1",
  fullName: "Test Member",
  status: "active" as const,
  photoUrl: null as string | null,
  gymId: 1000 as number | null,
};
const activeMembership = {
  id: "MS1",
  status: "active" as const,
  startDate: "2026-05-01",
  endDate: "2026-06-01",
  planName: "Monthly",
};

describe("evaluateCheckin", () => {
  it("returns ok with member info when everything is valid", () => {
    const r = evaluateCheckin({
      member: baseMember,
      memberships: [activeMembership],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.member.fullName).toBe("Test Member");
      expect(r.member.planName).toBe("Monthly");
      expect(r.member.expiresOn).toBe("2026-06-01");
      expect(r.member.daysRemaining).toBe(17);
    }
  });

  it("rejects when member is null (not found)", () => {
    const r = evaluateCheckin({
      member: null,
      memberships: [],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("rejects pending_approval before checking memberships", () => {
    const r = evaluateCheckin({
      member: { ...baseMember, status: "pending" },
      memberships: [activeMembership],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("pending_approval");
  });

  it("rejects inactive members", () => {
    const r = evaluateCheckin({
      member: { ...baseMember, status: "inactive" },
      memberships: [activeMembership],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("inactive");
  });

  it("rejects when no membership is currently active", () => {
    const r = evaluateCheckin({
      member: baseMember,
      memberships: [
        { ...activeMembership, status: "expired", endDate: "2026-04-01" },
      ],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_active_membership");
  });

  it("rejects when membership end_date is past today", () => {
    const r = evaluateCheckin({
      member: baseMember,
      memberships: [
        { ...activeMembership, status: "active", endDate: "2026-05-14" },
      ],
      todaySL: "2026-05-15",
      todayAttendance: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_active_membership");
  });

  it("rejects same-day duplicate check-in", () => {
    const r = evaluateCheckin({
      member: baseMember,
      memberships: [activeMembership],
      todayAttendance: [{ id: "A1", checkedInAt: "2026-05-15T03:00:00Z" }],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_checked_in_today");
  });

  it("daysRemaining is 0 on the final day (end_date == today)", () => {
    const r = evaluateCheckin({
      member: baseMember,
      memberships: [{ ...activeMembership, endDate: "2026-05-15" }],
      todayAttendance: [],
      todaySL: "2026-05-15",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.daysRemaining).toBe(0);
  });
});
