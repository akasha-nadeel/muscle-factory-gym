import { describe, it, expect } from "vitest";
import { generateOrderReference } from "@/lib/payhere/reference";

describe("generateOrderReference", () => {
  it("returns a value matching gym_<uuid> shape", () => {
    const r = generateOrderReference();
    expect(r).toMatch(
      /^gym_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns a different value on each call", () => {
    const a = generateOrderReference();
    const b = generateOrderReference();
    expect(a).not.toBe(b);
  });
});
