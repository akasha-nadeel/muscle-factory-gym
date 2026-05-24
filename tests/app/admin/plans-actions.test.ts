import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  plans,
  memberships,
  payments,
  attendance,
  workoutPlans,
  profiles,
} from "@/db/schema";
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

// ---------------------------------------------------------------------------
// Price-change protection: changing a plan's priceLkr while active members
// are on that plan retroactively rewrites their outstanding balance. The
// update action must reject the change with a clear error message in that
// case, while leaving name/duration/isActive edits freely allowed.
// ---------------------------------------------------------------------------

const PRICE_TEST_PREFIX = "PlanPriceBlock_xyz_";
const CLERK_PREFIX = "user_plan_price_block_test_";

const insertedProfileIds = new Set<string>();
const insertedPlanIds = new Set<string>();

async function cleanPriceFixtures() {
  const profileIds = [...insertedProfileIds];
  for (const id of profileIds) {
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id));
    await db.delete(payments).where(eq(payments.memberId, id));
    await db.delete(memberships).where(eq(memberships.memberId, id));
    await db.delete(attendance).where(eq(attendance.memberId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  insertedProfileIds.clear();
  for (const id of [...insertedPlanIds]) {
    await db.delete(plans).where(eq(plans.id, id));
  }
  insertedPlanIds.clear();
}

async function insertPlanRow(suffix: string, priceLkr = "4500") {
  const [row] = await db
    .insert(plans)
    .values({ name: `${PRICE_TEST_PREFIX}${suffix}`, durationDays: 30, priceLkr })
    .returning();
  insertedPlanIds.add(row.id);
  return row;
}

async function insertMemberRow(suffix: string) {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${suffix}`,
      email: `${suffix}@price-block.test`,
      fullName: `Price Block ${suffix}`,
      role: "member",
      status: "active",
    })
    .returning();
  insertedProfileIds.add(row.id);
  return row;
}

async function insertMembership(
  memberId: string,
  planId: string,
  status: "active" | "expired" | "cancelled",
) {
  const [row] = await db
    .insert(memberships)
    .values({
      memberId,
      planId,
      startDate: "2026-05-01",
      endDate: "2027-05-01", // future end date so it's not naturally expired
      status,
    })
    .returning();
  return row;
}

describe("_updatePlanUnsafe — price-change protection", () => {
  beforeEach(cleanPriceFixtures);
  afterEach(cleanPriceFixtures);

  it("blocks price change when 1+ active memberships exist", async () => {
    const plan = await insertPlanRow("block1", "4500");
    const member = await insertMemberRow("block1");
    await insertMembership(member.id, plan.id, "active");

    const result = await _updatePlanUnsafe(plan.id, {
      name: plan.name,
      durationDays: String(plan.durationDays),
      priceLkr: "5000",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect("_form" in result.errors).toBe(true);
      const formErr = (result.errors as { _form: string })._form;
      expect(formErr).toContain("Cannot change price");
      expect(formErr).toContain("1");
    }

    // DB still has the original price.
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.priceLkr).toBe("4500.00");
  });

  it("allows price change when only expired/cancelled memberships exist", async () => {
    const plan = await insertPlanRow("expired1", "4500");
    const member = await insertMemberRow("expired1");
    await insertMembership(member.id, plan.id, "expired");

    const result = await _updatePlanUnsafe(plan.id, {
      name: plan.name,
      durationDays: String(plan.durationDays),
      priceLkr: "5000",
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.priceLkr).toBe("5000.00");
  });

  it("allows price change when no memberships exist at all", async () => {
    const plan = await insertPlanRow("nomembers", "4500");

    const result = await _updatePlanUnsafe(plan.id, {
      name: plan.name,
      durationDays: String(plan.durationDays),
      priceLkr: "6200",
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.priceLkr).toBe("6200.00");
  });

  it("allows name/duration/isActive edits even when active memberships exist", async () => {
    const plan = await insertPlanRow("rename", "4500");
    const member = await insertMemberRow("rename");
    await insertMembership(member.id, plan.id, "active");

    const newName = `${PRICE_TEST_PREFIX}rename_v2`;
    const result = await _updatePlanUnsafe(plan.id, {
      name: newName,
      durationDays: "45",
      priceLkr: String(plan.priceLkr), // unchanged
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.name).toBe(newName);
    expect(row.durationDays).toBe(45);
    // Price unchanged.
    expect(row.priceLkr).toBe("4500.00");
    // Track the renamed plan so cleanup still finds it.
    insertedPlanIds.add(row.id);
  });

  it("allows priceLkr edit when new value equals current (no-op)", async () => {
    // Defensive: the form re-submits all fields on save. If the admin doesn't
    // touch the price, input.priceLkr ("4500") will equal the DB value
    // ("4500.00") numerically, so the price-change check must NOT fire even
    // though there are active memberships.
    const plan = await insertPlanRow("noop", "4500");
    const member = await insertMemberRow("noop");
    await insertMembership(member.id, plan.id, "active");

    const result = await _updatePlanUnsafe(plan.id, {
      name: plan.name,
      durationDays: String(plan.durationDays),
      priceLkr: "4500", // bare-form representation; DB has "4500.00"
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.priceLkr).toBe("4500.00");
  });
});
