import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import {
  profiles,
  attendance,
  memberships,
  payments,
  workoutPlans,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// Mock auth before importing the actions so requireAdminProfile() resolves to
// our fake admin profile instead of trying to redirect through Clerk. Vitest
// hoists vi.mock to the top of the file.
vi.mock("@/lib/auth", () => ({
  requireAdminProfile: vi.fn(),
}));

import { recordPayment } from "@/app/admin/payments/actions";
import { deleteMemberAction } from "@/app/admin/members/[id]/actions";
import { uploadWorkoutPlanAction } from "@/app/admin/workout-plans/actions";
import { requireAdminProfile } from "@/lib/auth";

const ADMIN_CLERK = "user_wiped_actions_admin";
const WIPED_FULL_NAME = "Former member";

// Track inserted profile IDs at module scope so clean() can reach wiped
// rows whose clerkUserId starts with "removed:" (still findable by id).
const insertedProfileIds = new Set<string>();

async function clean() {
  for (const id of [...insertedProfileIds]) {
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id));
    await db.delete(payments).where(eq(payments.memberId, id));
    await db.delete(memberships).where(eq(memberships.memberId, id));
    await db.delete(attendance).where(eq(attendance.memberId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  insertedProfileIds.clear();
  await db.delete(profiles).where(eq(profiles.clerkUserId, ADMIN_CLERK));
}

async function insertAdmin() {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: ADMIN_CLERK,
      email: "wiped-actions-admin@x.lk",
      fullName: "Wiped Actions Admin",
      role: "admin",
      status: "active",
    })
    .returning();
  insertedProfileIds.add(row.id);
  return row;
}

async function insertWipedMember() {
  // Insert a member row in the wiped shape directly. Matches what
  // _wipeStaleMembersUnsafe produces: clerkUserId='removed:<uuid>', nulled
  // PII, fullName='Former member', status='inactive'.
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: "removed:placeholder", // overwritten below to match id
      email: null,
      phone: null,
      photoUrl: null,
      fullName: WIPED_FULL_NAME,
      role: "member",
      status: "inactive",
      gymId: null,
    })
    .returning();
  const [updated] = await db
    .update(profiles)
    .set({ clerkUserId: `removed:${row.id}` })
    .where(eq(profiles.id, row.id))
    .returning();
  insertedProfileIds.add(updated.id);
  return updated;
}

beforeEach(async () => {
  await clean();
  const admin = await insertAdmin();
  vi.mocked(requireAdminProfile).mockResolvedValue(admin as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await clean();
});

describe("wiped-member action guards", () => {
  it("recordPayment rejects on wiped member", async () => {
    const wiped = await insertWipedMember();
    const fd = new FormData();
    fd.set("amountLkr", "2000");
    fd.set("method", "cash");
    fd.set("kind", "admission");
    fd.set("reference", "");
    fd.set("notes", "");

    const result = await recordPayment(
      { memberId: wiped.id, membershipId: null },
      undefined,
      fd,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/has been removed/);
    }

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, wiped.id));
    expect(rows.length).toBe(0);
  });

  it("deleteMemberAction rejects on wiped member", async () => {
    const wiped = await insertWipedMember();
    const result = await deleteMemberAction(wiped.id, WIPED_FULL_NAME);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/has been removed/);
    }

    // Profile row is still present (delete did not run).
    const [stillThere] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, wiped.id));
    expect(stillThere).toBeDefined();
    expect(stillThere.fullName).toBe(WIPED_FULL_NAME);
  });

  it("uploadWorkoutPlanAction rejects on wiped member", async () => {
    const wiped = await insertWipedMember();
    // Construct a minimal valid PDF File so the validator passes BEFORE the
    // isWiped gate runs. The gate sits after file validation, so we need a
    // file the validator accepts (PDF, under 5MB).
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const file = new File([pdfBytes], "plan.pdf", {
      type: "application/pdf",
    });
    const fd = new FormData();
    fd.set("file", file);

    const result = await uploadWorkoutPlanAction(wiped.id, undefined, fd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/has been removed/);
    }

    const rows = await db
      .select()
      .from(workoutPlans)
      .where(eq(workoutPlans.memberId, wiped.id));
    expect(rows.length).toBe(0);
  });
});
