import { describe, it, expect } from "vitest";
import {
  computeDbUsage,
  formatBytes,
  DB_SIZE_LIMIT_BYTES,
} from "@/lib/admin/db-usage";

const MB = 1024 * 1024;

describe("computeDbUsage", () => {
  it("computes the percentage against the 500 MB limit", () => {
    const u = computeDbUsage(250 * MB);
    expect(u.pct).toBe(50);
    expect(u.limitBytes).toBe(DB_SIZE_LIMIT_BYTES);
    expect(u.usedBytes).toBe(250 * MB);
  });

  it("clamps at 100% when over the limit", () => {
    expect(computeDbUsage(600 * MB).pct).toBe(100);
  });

  it("reports 0% for an empty database", () => {
    expect(computeDbUsage(0).pct).toBe(0);
  });

  it("rounds the percentage to one decimal", () => {
    // 27 MB / 500 MB = 5.4%
    expect(computeDbUsage(27 * MB).pct).toBe(5.4);
  });
});

describe("formatBytes", () => {
  it("formats tens of MB as a whole number", () => {
    expect(formatBytes(27 * MB)).toBe("27 MB");
  });

  it("formats the 500 MB limit", () => {
    expect(formatBytes(500 * MB)).toBe("500 MB");
  });

  it("formats small sizes with one decimal", () => {
    expect(formatBytes(1.5 * MB)).toBe("1.5 MB");
  });

  it("switches to GB past 1024 MB", () => {
    expect(formatBytes(2 * 1024 * MB)).toBe("2.00 GB");
  });
});
