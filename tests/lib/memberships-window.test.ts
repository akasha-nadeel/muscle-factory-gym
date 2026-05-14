import { describe, it, expect } from "vitest";
import { computeMembershipWindow } from "@/lib/memberships/window";

describe("computeMembershipWindow", () => {
  it("30-day plan starting today", () => {
    const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 30 });
    expect(w.startDate).toBe("2026-05-15");
    expect(w.endDate).toBe("2026-06-13");
  });

  it("1-day daily pass", () => {
    const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 1 });
    expect(w.startDate).toBe("2026-05-15");
    expect(w.endDate).toBe("2026-05-15");
  });

  it("365-day annual plan", () => {
    const w = computeMembershipWindow({ today: "2026-05-15", durationDays: 365 });
    expect(w.startDate).toBe("2026-05-15");
    expect(w.endDate).toBe("2027-05-14");
  });

  it("rolls over month boundaries", () => {
    const w = computeMembershipWindow({ today: "2026-01-31", durationDays: 30 });
    expect(w.endDate).toBe("2026-03-01");
  });

  it("rolls over year boundaries", () => {
    const w = computeMembershipWindow({ today: "2026-12-20", durationDays: 30 });
    expect(w.endDate).toBe("2027-01-18");
  });

  it("respects an explicit start date later than today (renewal stacking)", () => {
    const w = computeMembershipWindow({
      today: "2026-05-15",
      startOn: "2026-06-01",
      durationDays: 30,
    });
    expect(w.startDate).toBe("2026-06-01");
    expect(w.endDate).toBe("2026-06-30");
  });

  it("clamps startOn to today if startOn is in the past", () => {
    const w = computeMembershipWindow({
      today: "2026-05-15",
      startOn: "2026-01-01",
      durationDays: 30,
    });
    expect(w.startDate).toBe("2026-05-15");
  });
});
