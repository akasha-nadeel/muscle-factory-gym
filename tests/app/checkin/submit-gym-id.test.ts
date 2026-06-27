import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import {
  _previewGymIdUnsafe,
  _confirmCheckinUnsafe,
} from "@/app/checkin/actions";
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

async function attendanceCount(): Promise<number> {
  const rows = await db
    .select()
    .from(attendance)
    .where(eq(attendance.memberId, memberId));
  return rows.length;
}

describe("_previewGymIdUnsafe (step 1 — read-only)", () => {
  const today = todayInSL();

  it("returns member details WITHOUT recording attendance", async () => {
    const r = await _previewGymIdUnsafe({ gymIdRaw: "1200", todaySL: today });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.member.fullName).toBe("Submit Member");
      expect(r.member.gymId).toBe(1200);
      expect(r.member.memberId).toBe(memberId);
      expect(r.member.daysRemaining).toBeGreaterThan(0);
    }
    // The whole point of confirm-before-commit: nothing is written yet.
    expect(await attendanceCount()).toBe(0);
  });

  it("rejects non-numeric input as invalid_format", async () => {
    const r = await _previewGymIdUnsafe({ gymIdRaw: "abcd", todaySL: today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_format");
  });

  it("rejects out-of-range Gym ID as invalid_format", async () => {
    const r = await _previewGymIdUnsafe({ gymIdRaw: "999", todaySL: today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_format");
  });

  it("trims whitespace", async () => {
    const r = await _previewGymIdUnsafe({ gymIdRaw: "  1200  ", todaySL: today });
    expect(r.ok).toBe(true);
  });

  it("rejects an unknown Gym ID as not_found and writes nothing", async () => {
    const r = await _previewGymIdUnsafe({ gymIdRaw: "9876", todaySL: today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
    expect(await attendanceCount()).toBe(0);
  });
});

describe("_confirmCheckinUnsafe (step 2 — commit)", () => {
  const today = todayInSL();

  it("records attendance for the confirmed member", async () => {
    const r = await _confirmCheckinUnsafe({ memberId, todaySL: today });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.fullName).toBe("Submit Member");
    expect(await attendanceCount()).toBe(1);
  });

  it("is once-per-day — a second confirm is rejected, no duplicate row", async () => {
    const r1 = await _confirmCheckinUnsafe({ memberId, todaySL: today });
    expect(r1.ok).toBe(true);
    const r2 = await _confirmCheckinUnsafe({ memberId, todaySL: today });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("already_checked_in_today");
    expect(await attendanceCount()).toBe(1);
  });

  it("preview then confirm writes exactly one row (full flow)", async () => {
    const p = await _previewGymIdUnsafe({ gymIdRaw: "1200", todaySL: today });
    expect(p.ok).toBe(true);
    expect(await attendanceCount()).toBe(0);
    if (p.ok) {
      const c = await _confirmCheckinUnsafe({
        memberId: p.member.memberId,
        todaySL: today,
      });
      expect(c.ok).toBe(true);
    }
    expect(await attendanceCount()).toBe(1);
  });
});
