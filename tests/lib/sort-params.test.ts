import { describe, it, expect } from "vitest";
import { parseSortParams, nextSortFor } from "@/lib/sort-params";

const allowed = ["gymId", "fullName", "status", "createdAt"] as const;
const defaultSort = { field: "createdAt", dir: "desc" } as const;

describe("parseSortParams", () => {
  it("returns the default when both params are missing", () => {
    expect(parseSortParams(undefined, allowed, defaultSort)).toEqual(
      defaultSort,
    );
    expect(parseSortParams({}, allowed, defaultSort)).toEqual(defaultSort);
  });

  it("accepts a whitelisted field and a valid dir", () => {
    expect(
      parseSortParams({ sort: "fullName", dir: "asc" }, allowed, defaultSort),
    ).toEqual({ field: "fullName", dir: "asc" });
  });

  it("falls back to default field for unknown sort", () => {
    expect(
      parseSortParams({ sort: "ssn", dir: "asc" }, allowed, defaultSort),
    ).toEqual({ field: "createdAt", dir: "asc" });
  });

  it("falls back to default dir for unknown dir", () => {
    expect(
      parseSortParams(
        { sort: "gymId", dir: "ascending" },
        allowed,
        defaultSort,
      ),
    ).toEqual({ field: "gymId", dir: "desc" });
  });
});

describe("nextSortFor", () => {
  it("clicking a different field sorts by it desc", () => {
    expect(
      nextSortFor({ field: "createdAt", dir: "desc" }, "fullName"),
    ).toEqual({ field: "fullName", dir: "desc" });
  });

  it("clicking the active field flips direction", () => {
    expect(nextSortFor({ field: "gymId", dir: "desc" }, "gymId")).toEqual({
      field: "gymId",
      dir: "asc",
    });
    expect(nextSortFor({ field: "gymId", dir: "asc" }, "gymId")).toEqual({
      field: "gymId",
      dir: "desc",
    });
  });
});
