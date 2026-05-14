import { describe, it, expect } from "vitest";
import { daysRemaining } from "@/lib/days-remaining";

describe("daysRemaining", () => {
  it("0 when end_date equals today (last day inclusive)", () => {
    expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-15" })).toBe(0);
  });
  it("1 when end_date is tomorrow", () => {
    expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-16" })).toBe(1);
  });
  it("30 for a 30-day plan that started today", () => {
    // start=2026-05-15, end=2026-06-13 (inclusive 30 days)
    expect(daysRemaining({ today: "2026-05-15", endDate: "2026-06-13" })).toBe(29);
  });
  it("negative when end_date is in the past", () => {
    expect(daysRemaining({ today: "2026-05-15", endDate: "2026-05-14" })).toBe(-1);
  });
});
