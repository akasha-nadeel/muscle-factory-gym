import { describe, it, expect } from "vitest";
import {
  decideReminder,
  type DecideMember,
  type DecideMembership,
} from "@/lib/email/decide-reminder";

const baseMember: DecideMember = { status: "active", role: "member" };

function membership(
  overrides: Partial<DecideMembership>,
): DecideMembership {
  return {
    status: "active",
    endDate: "2026-05-19",
    reminder3dSentAt: null,
    reminder1dSentAt: null,
    lastOverdueReminderAt: null,
    ...overrides,
  };
}

describe("decideReminder", () => {
  it("returns null for an inactive member", () => {
    const r = decideReminder(
      { ...baseMember, status: "inactive" },
      membership({}),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns null for a pending member", () => {
    const r = decideReminder(
      { ...baseMember, status: "pending" },
      membership({}),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns null for an admin role", () => {
    const r = decideReminder(
      { status: "active", role: "admin" },
      membership({}),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns null when member has no memberships", () => {
    const r = decideReminder(baseMember, null, "2026-05-16");
    expect(r.kind).toBeNull();
  });

  it("returns null when membership is 5 days away (too early)", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-21" }),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns '3d' when active membership ends in 3 days and 3d stamp is null", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-19" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("3d");
  });

  it("returns '3d' when active membership ends in 2 days and 3d stamp is null (catch-up)", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-18" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("3d");
  });

  it("returns null when 3d stamp is already set and 3 days remain", () => {
    const r = decideReminder(
      baseMember,
      membership({
        endDate: "2026-05-19",
        reminder3dSentAt: new Date("2026-05-15T07:00:00Z"),
      }),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns '1d' when active membership ends in 1 day and 1d stamp is null", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-17" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("1d");
  });

  it("returns null when 1d stamp is already set and 1 day remains", () => {
    const r = decideReminder(
      baseMember,
      membership({
        endDate: "2026-05-17",
        reminder1dSentAt: new Date("2026-05-16T07:00:00Z"),
      }),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns '1d' (priority over 3d) when 1 day remains and both stamps null", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-17" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("1d");
  });

  it("returns '1d' (defensive) when endDate === today and 1d stamp null", () => {
    const r = decideReminder(
      baseMember,
      membership({ endDate: "2026-05-16" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("1d");
  });

  it("returns 'overdue' when membership is expired and last_overdue stamp is null", () => {
    const r = decideReminder(
      baseMember,
      membership({ status: "expired", endDate: "2026-05-10" }),
      "2026-05-16",
    );
    expect(r.kind).toBe("overdue");
  });

  it("returns 'overdue' when last_overdue stamp is from a prior day", () => {
    const r = decideReminder(
      baseMember,
      membership({
        status: "expired",
        endDate: "2026-05-10",
        lastOverdueReminderAt: new Date("2026-05-15T07:00:00Z"),
      }),
      "2026-05-16",
    );
    expect(r.kind).toBe("overdue");
  });

  it("returns null when last_overdue stamp is from today", () => {
    const r = decideReminder(
      baseMember,
      membership({
        status: "expired",
        endDate: "2026-05-10",
        lastOverdueReminderAt: new Date("2026-05-16T03:00:00Z"),
      }),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });

  it("returns null for a cancelled membership", () => {
    const r = decideReminder(
      baseMember,
      membership({ status: "cancelled", endDate: "2026-05-10" }),
      "2026-05-16",
    );
    expect(r.kind).toBeNull();
  });
});
