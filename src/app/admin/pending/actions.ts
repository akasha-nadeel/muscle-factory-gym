"use server";

import { db } from "@/db";
import { profiles, plans, memberships } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { format } from "date-fns";
import { requireAdminProfile } from "@/lib/auth";
import { computeMembershipWindow } from "@/lib/memberships/window";

export type ApproveInput = {
  memberId: string;
  planId: string;
  approvedByProfileId: string;
  today: string; // YYYY-MM-DD
};

export type ApproveResult = { ok: true } | { ok: false; error: string };

/**
 * Test-only helper: no auth gate, no Clerk metadata sync.
 * Phase 1 NOTE: this does NOT insert a payments row. Approval here means
 * "I trust this person and gave them a plan" — payment recording is Phase 2.
 */
export async function _approveMemberUnsafe(input: ApproveInput): Promise<ApproveResult> {
  const [member] = await db.select().from(profiles).where(eq(profiles.id, input.memberId)).limit(1);
  if (!member) return { ok: false, error: "Member not found" };
  if (member.status === "active") return { ok: false, error: "Member is already active" };

  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan) return { ok: false, error: "Plan not found" };
  if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

  const window = computeMembershipWindow({
    today: input.today,
    durationDays: plan.durationDays,
  });

  await db.transaction(async (tx) => {
    await tx.insert(memberships).values({
      memberId: input.memberId,
      planId: input.planId,
      startDate: window.startDate,
      endDate: window.endDate,
      status: "active",
      createdBy: input.approvedByProfileId,
    });
    await tx
      .update(profiles)
      .set({ status: "active" })
      .where(eq(profiles.id, input.memberId));
  });

  return { ok: true };
}

/**
 * Server-action wrapper called from the pending-approvals UI.
 * Calls requireAdminProfile() and mirrors status to Clerk publicMetadata.
 */
export async function approveMember(
  _prev: ApproveResult | undefined,
  formData: FormData,
): Promise<ApproveResult> {
  const admin = await requireAdminProfile();
  const memberId = String(formData.get("memberId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!memberId || !planId) return { ok: false, error: "memberId and planId required" };

  const today = format(new Date(), "yyyy-MM-dd");
  const result = await _approveMemberUnsafe({
    memberId,
    planId,
    approvedByProfileId: admin.id,
    today,
  });

  if (result.ok) {
    // Mirror status to Clerk metadata so the middleware sees it on next request.
    const [member] = await db.select().from(profiles).where(eq(profiles.id, memberId)).limit(1);
    if (member) {
      const client = await clerkClient();
      await client.users.updateUserMetadata(member.clerkUserId, {
        publicMetadata: { role: member.role, status: "active" },
      });
    }
    revalidatePath("/admin/pending");
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${memberId}`);
  }

  return result;
}
