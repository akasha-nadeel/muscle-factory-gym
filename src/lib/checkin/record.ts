import { db } from "@/db";
import { profiles, memberships, plans, attendance } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { evaluateCheckin, type CheckinResult } from "./evaluate";

type Source = "kiosk_id" | "qr_scan" | "manual";

/**
 * SL-local day window expressed as a UTC range:
 *  [todaySL 00:00 +05:30, todaySL+1 00:00 +05:30)
 * = [todaySL 18:30 UTC the previous calendar day, todaySL 18:30 UTC]
 * Postgres handles the timestamptz comparison correctly when we pass
 * the literal `YYYY-MM-DD 00:00:00+05:30` string.
 */
function slDayWindow(todaySL: string): {
  fromUtc: string;
  toUtc: string;
} {
  return {
    fromUtc: `${todaySL} 00:00:00+05:30`,
    toUtc: `${todaySL} 24:00:00+05:30`,
  };
}

async function loadAndEvaluate(input: {
  memberRow: typeof profiles.$inferSelect | null;
  todaySL: string;
}): Promise<CheckinResult> {
  if (!input.memberRow) {
    return evaluateCheckin({
      member: null,
      memberships: [],
      todayAttendance: [],
      todaySL: input.todaySL,
    });
  }
  const m = input.memberRow;

  const mems = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planName: plans.name,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.memberId, m.id));

  const { fromUtc, toUtc } = slDayWindow(input.todaySL);
  const todays = await db
    .select({ id: attendance.id, checkedInAt: attendance.checkedInAt })
    .from(attendance)
    .where(
      and(
        eq(attendance.memberId, m.id),
        gte(attendance.checkedInAt, sql`${fromUtc}::timestamptz`),
        lte(attendance.checkedInAt, sql`${toUtc}::timestamptz`),
      ),
    );

  return evaluateCheckin({
    member: {
      id: m.id,
      fullName: m.fullName,
      status: m.status,
      photoUrl: m.photoUrl,
      gymId: m.gymId,
    },
    memberships: mems,
    todayAttendance: todays.map((t) => ({
      id: t.id,
      checkedInAt: t.checkedInAt,
    })),
    todaySL: input.todaySL,
  });
}

async function insertAttendance(input: {
  memberId: string;
  membershipId: string;
  source: Source;
}): Promise<void> {
  await db.insert(attendance).values({
    memberId: input.memberId,
    membershipId: input.membershipId,
    source: input.source,
  });
}

export async function _recordAttendanceByGymIdUnsafe(input: {
  gymId: number;
  todaySL: string;
  source: Source;
}): Promise<CheckinResult> {
  const [memberRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.gymId, input.gymId))
    .limit(1);
  const evalResult = await loadAndEvaluate({
    memberRow: memberRow ?? null,
    todaySL: input.todaySL,
  });
  if (!evalResult.ok) return evalResult;
  await insertAttendance({
    memberId: evalResult.member.memberId,
    membershipId: evalResult.member.membershipId,
    source: input.source,
  });
  return evalResult;
}

export async function _recordAttendanceByMemberIdUnsafe(input: {
  memberId: string;
  todaySL: string;
  source: Source;
}): Promise<CheckinResult> {
  const [memberRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.memberId))
    .limit(1);
  const evalResult = await loadAndEvaluate({
    memberRow: memberRow ?? null,
    todaySL: input.todaySL,
  });
  if (!evalResult.ok) return evalResult;
  await insertAttendance({
    memberId: evalResult.member.memberId,
    membershipId: evalResult.member.membershipId,
    source: input.source,
  });
  return evalResult;
}
