import { describe, it, expect } from "vitest";
import { initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  it("returns first letters of first + last name", () => {
    expect(initialsOf("Akasha Nadeel")).toBe("AN");
    expect(initialsOf("jane doe")).toBe("JD");
  });

  it("uses first 2 letters of a single-word name", () => {
    expect(initialsOf("Madonna")).toBe("MA");
    expect(initialsOf("Jo")).toBe("JO");
  });

  it("handles a single letter name", () => {
    expect(initialsOf("A")).toBe("A");
  });

  it("returns '?' for empty / whitespace-only input", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });

  it("collapses internal whitespace and trims edges", () => {
    expect(initialsOf("  john   doe  ")).toBe("JD");
  });

  it("uses outermost names when the middle is given", () => {
    expect(initialsOf("Mary Anne Smith")).toBe("MS");
  });

  it("handles unicode code points without mojibake", () => {
    expect(initialsOf("Ñoño Älvaro")).toBe("ÑÄ");
  });
});
