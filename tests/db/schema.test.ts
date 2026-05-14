import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, payments, attendance } from "@/db/schema";

describe("schema: every table is queryable", () => {
  it.each([
    ["profiles", profiles],
    ["plans", plans],
    ["memberships", memberships],
    ["payments", payments],
    ["attendance", attendance],
  ])("can select from %s", async (_name, table) => {
    const rows = await db.select().from(table as never).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });
});
