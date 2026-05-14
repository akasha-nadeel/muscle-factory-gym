import { describe, it, expect } from "vitest";
import { getCurrentMembership, type MembershipForCurrentCheck } from "@/lib/memberships/current";

const today = "2026-05-15";

const m = (overrides: Partial<MembershipForCurrentCheck>): MembershipForCurrentCheck => ({
  id: overrides.id ?? "x",
  status: overrides.status ?? "active",
  startDate: overrides.startDate ?? "2026-01-01",
  endDate: overrides.endDate ?? "2026-12-31",
});

describe("getCurrentMembership", () => {
  it("returns null when no memberships", () => {
    expect(getCurrentMembership([], today)).toBeNull();
  });

  it("returns the active one with end_date >= today", () => {
    const result = getCurrentMembership(
      [m({ id: "a", status: "active", endDate: "2026-12-31" })],
      today,
    );
    expect(result?.id).toBe("a");
  });

  it("ignores expired ones (end_date < today)", () => {
    const result = getCurrentMembership(
      [m({ id: "a", status: "active", endDate: "2026-05-14" })],
      today,
    );
    expect(result).toBeNull();
  });

  it("ignores cancelled status even if end_date is in future", () => {
    const result = getCurrentMembership(
      [m({ id: "a", status: "cancelled", endDate: "2026-12-31" })],
      today,
    );
    expect(result).toBeNull();
  });

  it("picks the one with the latest end_date when multiple active overlap", () => {
    const result = getCurrentMembership(
      [
        m({ id: "a", status: "active", endDate: "2026-06-30" }),
        m({ id: "b", status: "active", endDate: "2026-09-30" }),
        m({ id: "c", status: "active", endDate: "2026-07-15" }),
      ],
      today,
    );
    expect(result?.id).toBe("b");
  });
});
