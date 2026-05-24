"use server";

import { db } from "@/db";
import { plans, memberships } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { validatePlanInput, type PlanInput } from "@/lib/plans/validate";

export type PlanActionResult =
  | { ok: true }
  | { ok: false; errors: Partial<Record<keyof PlanInput, string>> | { _form: string } };

// ---- Un-gated helpers (test-only) ------------------------------------------
// These exist so tests can exercise the mutation logic without a Clerk session.
// The gated server-action wrappers below call requireAdminProfile() first.

export async function _createPlanUnsafe(raw: PlanInput): Promise<PlanActionResult> {
  const v = validatePlanInput(raw);
  if (!v.ok) return { ok: false, errors: v.errors };
  await db.insert(plans).values({
    name: v.value.name,
    durationDays: v.value.durationDays,
    priceLkr: v.value.priceLkr,
  });
  return { ok: true };
}

export async function _updatePlanUnsafe(
  id: string,
  raw: PlanInput,
): Promise<PlanActionResult> {
  const v = validatePlanInput(raw);
  if (!v.ok) return { ok: false, errors: v.errors };

  const [existing] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);
  if (!existing) return { ok: false, errors: { _form: "Plan not found" } };

  // Compare numerically so a form value of "4500" matches a DB value of
  // "4500.00". priceLkr is a Postgres numeric (string in Drizzle); coercing
  // both sides via Number is safe for LKR amounts (whole or 2-decimal).
  const priceChanging = Number(existing.priceLkr) !== Number(v.value.priceLkr);
  if (priceChanging) {
    const [{ count: activeCount } = { count: 0 }] = await db
      .select({ count: count() })
      .from(memberships)
      .where(
        and(eq(memberships.planId, id), eq(memberships.status, "active")),
      );
    const n = Number(activeCount ?? 0);
    if (n > 0) {
      return {
        ok: false,
        errors: {
          _form: `Cannot change price while ${n} active member${
            n === 1 ? "" : "s"
          } ${n === 1 ? "is" : "are"} on this plan. Disable this plan and create a new one with the new price for future members.`,
        },
      };
    }
  }

  await db
    .update(plans)
    .set({
      name: v.value.name,
      durationDays: v.value.durationDays,
      priceLkr: v.value.priceLkr,
    })
    .where(eq(plans.id, id));
  return { ok: true };
}

export async function _setPlanActiveUnsafe(
  id: string,
  isActive: boolean,
): Promise<PlanActionResult> {
  await db.update(plans).set({ isActive }).where(eq(plans.id, id));
  return { ok: true };
}

// ---- Gated server actions (called from forms) -------------------------------

export async function createPlan(
  _prev: PlanActionResult | undefined,
  formData: FormData,
): Promise<PlanActionResult> {
  await requireAdminProfile();
  const raw: PlanInput = {
    name: String(formData.get("name") ?? ""),
    durationDays: String(formData.get("durationDays") ?? ""),
    priceLkr: String(formData.get("priceLkr") ?? ""),
  };
  const result = await _createPlanUnsafe(raw);
  if (result.ok) revalidatePath("/admin/plans");
  return result;
}

export async function updatePlan(
  id: string,
  _prev: PlanActionResult | undefined,
  formData: FormData,
): Promise<PlanActionResult> {
  await requireAdminProfile();
  const raw: PlanInput = {
    name: String(formData.get("name") ?? ""),
    durationDays: String(formData.get("durationDays") ?? ""),
    priceLkr: String(formData.get("priceLkr") ?? ""),
  };
  const result = await _updatePlanUnsafe(id, raw);
  if (result.ok) revalidatePath("/admin/plans");
  return result;
}

export async function setPlanActive(id: string, isActive: boolean) {
  await requireAdminProfile();
  const result = await _setPlanActiveUnsafe(id, isActive);
  if (result.ok) revalidatePath("/admin/plans");
  return result;
}
