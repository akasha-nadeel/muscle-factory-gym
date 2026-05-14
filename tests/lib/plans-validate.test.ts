import { describe, it, expect } from "vitest";
import { validatePlanInput } from "@/lib/plans/validate";

describe("validatePlanInput", () => {
  it("accepts a valid plan", () => {
    const r = validatePlanInput({ name: "Monthly", durationDays: "30", priceLkr: "5000.00" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ name: "Monthly", durationDays: 30, priceLkr: "5000.00" });
    }
  });

  it("trims the name", () => {
    const r = validatePlanInput({ name: "  Quarterly  ", durationDays: "90", priceLkr: "12000" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("Quarterly");
  });

  it("rejects empty name", () => {
    const r = validatePlanInput({ name: "  ", durationDays: "30", priceLkr: "5000" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeDefined();
  });

  it("rejects durationDays = 0 or negative", () => {
    expect(validatePlanInput({ name: "x", durationDays: "0", priceLkr: "1" }).ok).toBe(false);
    expect(validatePlanInput({ name: "x", durationDays: "-3", priceLkr: "1" }).ok).toBe(false);
  });

  it("rejects non-integer durationDays", () => {
    const r = validatePlanInput({ name: "x", durationDays: "1.5", priceLkr: "1" });
    expect(r.ok).toBe(false);
  });

  it("rejects negative priceLkr", () => {
    const r = validatePlanInput({ name: "x", durationDays: "30", priceLkr: "-1" });
    expect(r.ok).toBe(false);
  });

  it("accepts priceLkr = 0 (free trial plan)", () => {
    const r = validatePlanInput({ name: "Trial", durationDays: "7", priceLkr: "0" });
    expect(r.ok).toBe(true);
  });

  it("normalizes priceLkr to two decimal places", () => {
    const r = validatePlanInput({ name: "x", durationDays: "30", priceLkr: "5000" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.priceLkr).toBe("5000.00");
  });
});
