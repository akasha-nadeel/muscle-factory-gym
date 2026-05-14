import { describe, it, expect } from "vitest";
import { validateProfileEdit } from "@/lib/profile/validate";

describe("validateProfileEdit", () => {
  it("accepts a valid name + Sri Lanka phone", () => {
    const r = validateProfileEdit({ fullName: "Kasun Perera", phone: "0771234567" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fullName).toBe("Kasun Perera");
      expect(r.value.phone).toBe("0771234567");
    }
  });
  it("trims the name", () => {
    const r = validateProfileEdit({ fullName: "  Kasun  ", phone: "0771234567" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fullName).toBe("Kasun");
  });
  it("rejects empty name", () => {
    expect(validateProfileEdit({ fullName: " ", phone: "0771234567" }).ok).toBe(false);
  });
  it("allows empty phone (sets to null)", () => {
    const r = validateProfileEdit({ fullName: "Kasun", phone: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.phone).toBeNull();
  });
  it("rejects nonsense phone", () => {
    expect(validateProfileEdit({ fullName: "x", phone: "abc" }).ok).toBe(false);
  });
});
