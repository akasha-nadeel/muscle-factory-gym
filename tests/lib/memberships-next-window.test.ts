import { describe, it, expect } from "vitest";
import { computeNextMembershipWindow } from "@/lib/memberships/next-window";

describe("computeNextMembershipWindow", () => {
  it("starts today when there is no prior membership", () => {
    const w = computeNextMembershipWindow({
      today: "2026-05-16",
      durationDays: 30,
      latestActiveEndDate: null,
    });
    expect(w.startDate).toBe("2026-05-16");
    expect(w.endDate).toBe("2026-06-14");
  });

  it("starts day after prior end_date when prior is still active", () => {
    const w = computeNextMembershipWindow({
      today: "2026-05-16",
      durationDays: 30,
      latestActiveEndDate: "2026-06-01",
    });
    expect(w.startDate).toBe("2026-06-02");
    expect(w.endDate).toBe("2026-07-01");
  });

  it("starts today when prior already expired", () => {
    const w = computeNextMembershipWindow({
      today: "2026-05-16",
      durationDays: 30,
      latestActiveEndDate: "2026-04-01",
    });
    expect(w.startDate).toBe("2026-05-16");
    expect(w.endDate).toBe("2026-06-14");
  });

  it("starts tomorrow when prior end_date is exactly today", () => {
    const w = computeNextMembershipWindow({
      today: "2026-05-16",
      durationDays: 30,
      latestActiveEndDate: "2026-05-16",
    });
    expect(w.startDate).toBe("2026-05-17");
    expect(w.endDate).toBe("2026-06-15");
  });

  it("1-day plan stacking: start === end", () => {
    const w = computeNextMembershipWindow({
      today: "2026-05-16",
      durationDays: 1,
      latestActiveEndDate: "2026-05-20",
    });
    expect(w.startDate).toBe("2026-05-21");
    expect(w.endDate).toBe("2026-05-21");
  });

  it("rejects non-positive durationDays", () => {
    expect(() =>
      computeNextMembershipWindow({
        today: "2026-05-16",
        durationDays: 0,
        latestActiveEndDate: null,
      }),
    ).toThrow();
  });
});
