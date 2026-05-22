import { describe, it, expect } from "vitest";
import {
  inferCyclePeriod,
  computeNextPaymentDue,
} from "@/lib/payments/next-due";

describe("inferCyclePeriod", () => {
  it("recognizes yearly variants", () => {
    expect(inferCyclePeriod("Annual")).toBe("yearly");
    expect(inferCyclePeriod("yearly")).toBe("yearly");
    expect(inferCyclePeriod("1 Year Plan")).toBe("yearly");
  });

  it("recognizes quarterly variants", () => {
    expect(inferCyclePeriod("Quarterly")).toBe("quarterly");
    expect(inferCyclePeriod("3 month plan")).toBe("quarterly");
  });

  it("recognizes daily variants", () => {
    expect(inferCyclePeriod("Daily Pass")).toBe("daily");
    expect(inferCyclePeriod("daily")).toBe("daily");
    expect(inferCyclePeriod("Day pass")).toBe("daily");
  });

  it("defaults to monthly for monthly + unknown", () => {
    expect(inferCyclePeriod("Monthly")).toBe("monthly");
    expect(inferCyclePeriod("Premium")).toBe("monthly");
    expect(inferCyclePeriod("")).toBe("monthly");
  });
});

describe("computeNextPaymentDue", () => {
  it("monthly: Oct 5 → Nov 5 (user's example)", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-10-05",
        cyclePeriod: "monthly",
        today: "2026-10-15",
      }),
    ).toBe("2026-11-05");
  });

  it("monthly: end-of-month clamps (Jan 31 → Feb 28)", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-01-31",
        cyclePeriod: "monthly",
        today: "2026-02-01",
      }),
    ).toBe("2026-02-28"); // 2026 is not a leap year
  });

  it("monthly: end-of-month leap year (Jan 31 → Feb 29 in 2028)", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2028-01-31",
        cyclePeriod: "monthly",
        today: "2028-02-01",
      }),
    ).toBe("2028-02-29");
  });

  it("quarterly: Oct 5 → Jan 5 next year", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-10-05",
        cyclePeriod: "quarterly",
        today: "2026-11-01",
      }),
    ).toBe("2027-01-05");
  });

  it("yearly: Oct 5 2026 → Oct 5 2027", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-10-05",
        cyclePeriod: "yearly",
        today: "2026-12-01",
      }),
    ).toBe("2027-10-05");
  });

  it("daily: Oct 5 → Oct 6", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-10-05",
        cyclePeriod: "daily",
        today: "2026-10-05",
      }),
    ).toBe("2026-10-06");
  });

  it("skips past missed cycles — member misses 3 monthlies, due is next upcoming", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-01-05",
        cyclePeriod: "monthly",
        today: "2026-04-15",
      }),
    ).toBe("2026-05-05");
  });

  it("returns the very next cycle when today is well before any due", () => {
    expect(
      computeNextPaymentDue({
        membershipStart: "2026-10-05",
        cyclePeriod: "monthly",
        today: "2026-10-06",
      }),
    ).toBe("2026-11-05");
  });
});
