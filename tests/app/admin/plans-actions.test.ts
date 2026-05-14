import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createPlan, updatePlan, setPlanActive } from "@/app/admin/plans/actions";

// The actions call requireAdminProfile() which redirects unauthenticated.
// In unit tests, we exercise the underlying helpers via a `__test` export.
// For now we test the un-gated helpers; the gated wrappers get a smoke test
// in Task 10.

import { _createPlanUnsafe, _updatePlanUnsafe, _setPlanActiveUnsafe } from "@/app/admin/plans/actions";

const NAME = "TestPlan_xyz_phase1";

async function cleanup() {
  await db.delete(plans).where(eq(plans.name, NAME));
}

describe("plan mutations (un-gated helpers)", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("creates a plan with valid input", async () => {
    const result = await _createPlanUnsafe({
      name: NAME,
      durationDays: "45",
      priceLkr: "7500",
    });
    expect(result.ok).toBe(true);
    const rows = await db.select().from(plans).where(eq(plans.name, NAME));
    expect(rows.length).toBe(1);
    expect(rows[0].durationDays).toBe(45);
    expect(rows[0].priceLkr).toBe("7500.00");
    expect(rows[0].isActive).toBe(true);
  });

  it("rejects invalid input without writing", async () => {
    const result = await _createPlanUnsafe({
      name: "",
      durationDays: "-1",
      priceLkr: "abc",
    });
    expect(result.ok).toBe(false);
    const rows = await db.select().from(plans).where(eq(plans.name, NAME));
    expect(rows.length).toBe(0);
  });

  it("updates an existing plan", async () => {
    const [created] = await db
      .insert(plans)
      .values({ name: NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    const r = await _updatePlanUnsafe(created.id, {
      name: NAME,
      durationDays: "60",
      priceLkr: "9000",
    });
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, created.id));
    expect(row.durationDays).toBe(60);
    expect(row.priceLkr).toBe("9000.00");
  });

  it("soft-disables a plan (sets is_active=false)", async () => {
    const [created] = await db
      .insert(plans)
      .values({ name: NAME, durationDays: 30, priceLkr: "5000" })
      .returning();
    const r = await _setPlanActiveUnsafe(created.id, false);
    expect(r.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, created.id));
    expect(row.isActive).toBe(false);
  });
});
