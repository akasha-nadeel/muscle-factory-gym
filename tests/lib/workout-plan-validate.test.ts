import { describe, it, expect } from "vitest";
import { validateWorkoutPlanFile } from "@/lib/workout-plans/validate";

const MB = 1024 * 1024;

describe("validateWorkoutPlanFile", () => {
  it("accepts a 1 MB PDF", () => {
    const r = validateWorkoutPlanFile({
      type: "application/pdf",
      size: 1 * MB,
    });
    expect(r.ok).toBe(true);
  });

  it("accepts exactly 5 MB", () => {
    const r = validateWorkoutPlanFile({
      type: "application/pdf",
      size: 5 * MB,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects 5 MB + 1 byte", () => {
    const r = validateWorkoutPlanFile({
      type: "application/pdf",
      size: 5 * MB + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });

  it("rejects empty files", () => {
    const r = validateWorkoutPlanFile({
      type: "application/pdf",
      size: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it("rejects non-PDF types", () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "text/plain",
      "application/zip",
      "",
    ]) {
      const r = validateWorkoutPlanFile({ type, size: 1 * MB });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/pdf/i);
    }
  });
});
