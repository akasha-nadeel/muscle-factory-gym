import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import {
  _recordAttendanceByGymIdUnsafe,
  _recordAttendanceByMemberIdUnsafe,
} from "@/lib/checkin/record";

const CLERK_PREFIX = "user_phase3_record_";
const PLAN_NAME = "Phase3RecordPlan";

let memberId: string;
let planId: string;

async function clean() {
  const members = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of members) {
    await db.delete(attendance).where(eq(attendance.memberId, m.id));
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

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
      email: "rec@x.lk",
      fullName: "Record Member",
      role: "member",
      status: "active",
      gymId: 1100,
    })
    .returning();
  memberId = m.id;
  await db.insert(memberships).values({
    memberId,
    planId,
    startDate: "2026-05-01",
    endDate: "2026-06-30",
    status: "active",
  });
});

afterEach(clean);

describe("_recordAttendanceByGymIdUnsafe", () => {
  it("inserts attendance row with source='kiosk_id' on happy path", async () => {
    const r = await _recordAttendanceByGymIdUnsafe({
      gymId: 1100,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.fullName).toBe("Record Member");
    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, memberId));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("kiosk_id");
  });

  it("rejects unknown gym_id with not_found", async () => {
    const r = await _recordAttendanceByGymIdUnsafe({
      gymId: 9876,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("rejects same-day duplicate", async () => {
    const r1 = await _recordAttendanceByGymIdUnsafe({
      gymId: 1100,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r1.ok).toBe(true);
    const r2 = await _recordAttendanceByGymIdUnsafe({
      gymId: 1100,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("already_checked_in_today");
    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, memberId));
    expect(rows.length).toBe(1);
  });

  it("rejects when member is pending", async () => {
    await db
      .update(profiles)
      .set({ status: "pending" })
      .where(eq(profiles.id, memberId));
    const r = await _recordAttendanceByGymIdUnsafe({
      gymId: 1100,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("pending_approval");
  });

  it("rejects when membership is expired", async () => {
    await db
      .update(memberships)
      .set({ status: "expired", endDate: "2026-04-01" })
      .where(eq(memberships.memberId, memberId));
    const r = await _recordAttendanceByGymIdUnsafe({
      gymId: 1100,
      todaySL: "2026-05-15",
      source: "kiosk_id",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_active_membership");
  });
});

describe("_recordAttendanceByMemberIdUnsafe", () => {
  it("inserts attendance row with source='qr_scan' for mobile-app path", async () => {
    const r = await _recordAttendanceByMemberIdUnsafe({
      memberId,
      todaySL: "2026-05-15",
      source: "qr_scan",
    });
    expect(r.ok).toBe(true);
    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, memberId));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("qr_scan");
  });
});
