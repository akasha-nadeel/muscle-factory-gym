import { describe, it, expect } from "vitest";
import { computeOutstanding } from "@/lib/payments/outstanding";
import { countCyclesElapsed } from "@/lib/payments/next-due";

const MID = "m-1";

function pay(amount: number, kind: "membership" | "admission" = "membership") {
  return {
    id: `p-${Math.random()}`,
    amountLkr: String(amount),
    kind,
    status: "succeeded" as const,
    membershipId: MID,
  };
}

describe("countCyclesElapsed", () => {
  it("returns 1 on signup day", () => {
    expect(
      countCyclesElapsed({
        membershipStart: "2026-05-23",
        cyclePeriod: "monthly",
        today: "2026-05-23",
      }),
    ).toBe(1);
  });

  it("returns 1 just before next due", () => {
    expect(
      countCyclesElapsed({
        membershipStart: "2026-05-23",
        cyclePeriod: "monthly",
        today: "2026-06-22",
      }),
    ).toBe(1);
  });

  it("ticks to 2 on the next-due day", () => {
    expect(
      countCyclesElapsed({
        membershipStart: "2026-05-23",
        cyclePeriod: "monthly",
        today: "2026-06-23",
      }),
    ).toBe(2);
  });

  it("ticks to 3 two months in", () => {
    expect(
      countCyclesElapsed({
        membershipStart: "2026-05-23",
        cyclePeriod: "monthly",
        today: "2026-07-25",
      }),
    ).toBe(3);
  });

  it("returns 0 when today is before start", () => {
    expect(
      countCyclesElapsed({
        membershipStart: "2026-05-23",
        cyclePeriod: "monthly",
        today: "2026-05-20",
      }),
    ).toBe(0);
  });
});

describe("computeOutstanding (cycle-aware)", () => {
  it("settles after one paid cycle", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "4500",
        payments: [pay(4500)],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2026-06-22",
          cyclePeriod: "monthly",
        },
      }),
    ).toBe("0.00");
  });

  it("kicks back up to one cycle on next-due day", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "4500",
        payments: [pay(4500)],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2026-06-23",
          cyclePeriod: "monthly",
        },
      }),
    ).toBe("4500.00");
  });

  it("accumulates to two cycles after two missed dues", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "4500",
        payments: [pay(4500)],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2026-07-23",
          cyclePeriod: "monthly",
        },
      }),
    ).toBe("9000.00");
  });

  it("ignores admission fee payments", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "4500",
        payments: [pay(4500), pay(1000, "admission")],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2026-06-22",
          cyclePeriod: "monthly",
        },
      }),
    ).toBe("0.00");
  });

  it("falls back to single-cycle math when no cycleContext given", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "4500",
        payments: [pay(2000)],
        membershipId: MID,
      }),
    ).toBe("2500.00");
  });

  it("yearly: one paid cycle settles for the year", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "50000",
        payments: [pay(50000)],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2026-12-31",
          cyclePeriod: "yearly",
        },
      }),
    ).toBe("0.00");
  });

  it("yearly: shows dues on the anniversary", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "50000",
        payments: [pay(50000)],
        membershipId: MID,
        cycleContext: {
          startDate: "2026-05-23",
          today: "2027-05-23",
          cyclePeriod: "yearly",
        },
      }),
    ).toBe("50000.00");
  });
});
