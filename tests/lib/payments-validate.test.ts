import { describe, it, expect } from "vitest";
import { validatePaymentInput } from "@/lib/payments/validate";

describe("validatePaymentInput", () => {
  it("accepts a valid cash membership payment", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        amountLkr: "5000.00",
        method: "cash",
        kind: "membership",
        reference: null,
        notes: null,
      });
    }
  });

  it("accepts a valid bank_transfer admission payment with reference", () => {
    const r = validatePaymentInput({
      amountLkr: "2000",
      method: "bank_transfer",
      kind: "admission",
      reference: "TXN-ABC-123",
      notes: "Initial joining fee",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reference).toBe("TXN-ABC-123");
      expect(r.value.notes).toBe("Initial joining fee");
    }
  });

  it("normalizes amount to 2 decimal places", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amountLkr).toBe("5000.00");
  });

  it("rejects zero amount", () => {
    const r = validatePaymentInput({
      amountLkr: "0",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amountLkr).toBeDefined();
  });

  it("rejects negative amount (refunds use a dedicated helper, not this validator)", () => {
    const r = validatePaymentInput({
      amountLkr: "-100",
      method: "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown method", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "bitcoin" as unknown as "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.method).toBeDefined();
  });

  it("rejects payhere method (online payments are Phase 4, not manual)", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "payhere" as unknown as "cash",
      kind: "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown kind", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "cash",
      kind: "trainer_fee" as unknown as "membership",
      reference: "",
      notes: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.kind).toBeDefined();
  });

  it("trims whitespace from reference and notes; empty becomes null", () => {
    const r = validatePaymentInput({
      amountLkr: "5000",
      method: "cash",
      kind: "membership",
      reference: "  ",
      notes: "  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reference).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });
});
