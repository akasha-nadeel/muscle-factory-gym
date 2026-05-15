import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _submitGymIdUnsafe } from "@/app/checkin/actions";
import { todayInSL } from "@/lib/tz";

const CLERK_PREFIX = "user_phase3_submit_";
const PLAN_NAME = "Phase3SubmitPlan";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(attendance).where(eq(attendance.memberId, m.id));
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;
let planId: string;

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
    .returning();
  planId = pl.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "sub@x.lk",
      fullName: "Submit Member",
      role: "member",
      status: "active",
      gymId: 1200,
    })
    .returning();
  memberId = m.id;
  await db.insert(memberships).values({
    memberId,
    planId,
    startDate: "2026-05-01",
    endDate: "2099-12-31",
    status: "active",
  });
});

afterEach(clean);

describe("_submitGymIdUnsafe", () => {
  const today = todayInSL();

  it("happy path returns member details and inserts attendance", async () => {
    const r = await _submitGymIdUnsafe({
      gymIdRaw: "1200",
      todaySL: today,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.member.fullName).toBe("Submit Member");
      expect(r.member.gymId).toBe(1200);
      expect(r.member.daysRemaining).toBeGreaterThan(0);
    }
  });

  it("rejects non-numeric input as invalid_format", async () => {
    const r = await _submitGymIdUnsafe({
      gymIdRaw: "abcd",
      todaySL: today,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_format");
  });

  it("rejects out-of-range Gym ID as invalid_format", async () => {
    const r = await _submitGymIdUnsafe({
      gymIdRaw: "999",
      todaySL: today,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_format");
  });

  it("trims whitespace", async () => {
    const r = await _submitGymIdUnsafe({
      gymIdRaw: "  1200  ",
      todaySL: today,
    });
    expect(r.ok).toBe(true);
  });
});
