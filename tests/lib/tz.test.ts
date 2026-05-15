import { describe, it, expect } from "vitest";
import { todayInSL, slMonthOf } from "@/lib/tz";

describe("todayInSL", () => {
  it("returns the SL date when given UTC noon (the same day everywhere)", () => {
    // 2026-05-15 12:00:00 UTC = 17:30 SL same day
    expect(todayInSL(new Date("2026-05-15T12:00:00Z"))).toBe("2026-05-15");
  });

  it("rolls forward to the next day when UTC is between 18:30 and 23:59", () => {
    // 2026-05-15 18:30 UTC = 2026-05-16 00:00 SL
    expect(todayInSL(new Date("2026-05-15T18:30:00Z"))).toBe("2026-05-16");
    // 2026-05-15 23:00 UTC = 2026-05-16 04:30 SL
    expect(todayInSL(new Date("2026-05-15T23:00:00Z"))).toBe("2026-05-16");
  });

  it("rolls backward by NOT rolling — UTC midnight is already SL 05:30 same date", () => {
    // 2026-05-15 00:00 UTC = 2026-05-15 05:30 SL — already in 15th
    expect(todayInSL(new Date("2026-05-15T00:00:00Z"))).toBe("2026-05-15");
  });

  it("handles month boundary", () => {
    // 2026-05-31 19:00 UTC = 2026-06-01 00:30 SL
    expect(todayInSL(new Date("2026-05-31T19:00:00Z"))).toBe("2026-06-01");
  });

  it("handles year boundary", () => {
    // 2026-12-31 20:00 UTC = 2027-01-01 01:30 SL
    expect(todayInSL(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });
});

describe("slMonthOf", () => {
  it("returns YYYY-MM in SL time", () => {
    expect(slMonthOf(new Date("2026-05-15T12:00:00Z"))).toBe("2026-05");
    // 2026-05-31 19:00 UTC = 2026-06-01 SL
    expect(slMonthOf(new Date("2026-05-31T19:00:00Z"))).toBe("2026-06");
  });
});
