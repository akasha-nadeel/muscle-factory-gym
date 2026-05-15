import { describe, it, expect } from "vitest";
import { computeOutstanding, type PaymentForOutstanding } from "@/lib/payments/outstanding";

const p = (overrides: Partial<PaymentForOutstanding>): PaymentForOutstanding => ({
  id: "x",
  amountLkr: "0",
  kind: "membership",
  status: "succeeded",
  membershipId: "M1",
  ...overrides,
});

describe("computeOutstanding", () => {
  it("returns full plan price when no payments exist", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [],
        membershipId: "M1",
      }),
    ).toBe("5000.00");
  });

  it("subtracts a single succeeded membership payment", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [p({ amountLkr: "3000.00" })],
        membershipId: "M1",
      }),
    ).toBe("2000.00");
  });

  it("returns 0 when paid in full", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [p({ amountLkr: "5000.00" })],
        membershipId: "M1",
      }),
    ).toBe("0.00");
  });

  it("clamps to 0 when over-paid (never negative)", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [p({ amountLkr: "6000.00" })],
        membershipId: "M1",
      }),
    ).toBe("0.00");
  });

  it("counts refunds (negative amounts) against the sum", () => {
    // Paid 5000, then refunded 2000. Net paid = 3000. Outstanding = 5000 - 3000 = 2000.
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [
          p({ id: "a", amountLkr: "5000.00", status: "succeeded" }),
          p({ id: "b", amountLkr: "-2000.00", status: "refunded" }),
        ],
        membershipId: "M1",
      }),
    ).toBe("2000.00");
  });

  it("ignores admission payments (they're one-time, not tied to membership)", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [
          p({ amountLkr: "2000.00", kind: "admission", membershipId: null }),
        ],
        membershipId: "M1",
      }),
    ).toBe("5000.00");
  });

  it("ignores payments tied to a different membership", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [p({ amountLkr: "5000.00", membershipId: "DIFFERENT" })],
        membershipId: "M1",
      }),
    ).toBe("5000.00");
  });

  it("ignores pending/failed payments", () => {
    expect(
      computeOutstanding({
        planPriceLkr: "5000.00",
        payments: [
          p({ amountLkr: "5000.00", status: "pending" }),
          p({ id: "y", amountLkr: "5000.00", status: "failed" }),
        ],
        membershipId: "M1",
      }),
    ).toBe("5000.00");
  });
});
