import { db } from "@/db";
import { profiles, memberships, plans, attendance } from "@/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import { evaluateCheckin, type CheckinResult } from "./evaluate";

type Source = "kiosk_id" | "qr_scan" | "manual";

/**
 * SL-local day window expressed as a UTC range, half-open:
 *  [todaySL 00:00 +05:30, todaySL+1 00:00 +05:30)
 *
 * fromUtc = start of `todaySL` in SL time.
 * toUtc   = start of the next calendar day in SL time (exclusive).
 *
 * The half-open interval avoids ambiguity at the SL-midnight boundary:
 * a row stamped at exactly that instant belongs to the next day's window,
 * not this one.
 */
function slDayWindow(todaySL: string): {
  fromUtc: string;
  toUtcExclusive: string;
} {
  const next = format(addDays(parseISO(todaySL), 1), "yyyy-MM-dd");
  return {
    fromUtc: `${todaySL} 00:00:00+05:30`,
    toUtcExclusive: `${next} 00:00:00+05:30`,
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

  const { fromUtc, toUtcExclusive } = slDayWindow(input.todaySL);
  const todays = await db
    .select({ id: attendance.id, checkedInAt: attendance.checkedInAt })
    .from(attendance)
    .where(
      and(
        eq(attendance.memberId, m.id),
        gte(attendance.checkedInAt, sql`${fromUtc}::timestamptz`),
        lt(attendance.checkedInAt, sql`${toUtcExclusive}::timestamptz`),
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

/**
 * Read-only counterpart to `_recordAttendanceByGymIdUnsafe`: resolves a Gym ID
 * to a member and evaluates eligibility WITHOUT writing an attendance row.
 *
 * This is the first half of the kiosk's confirm-before-commit flow — the
 * member sees their own photo/name and confirms before anything is recorded,
 * so a mistyped Gym ID (e.g. 1002 instead of 1001) can never mark the wrong
 * person present. The commit half reuses `_recordAttendanceByMemberIdUnsafe`,
 * keyed by the resolved memberId rather than the re-typed number.
 */
export async function _evaluateByGymIdUnsafe(input: {
  gymId: number;
  todaySL: string;
}): Promise<CheckinResult> {
  const [memberRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.gymId, input.gymId))
    .limit(1);
  return loadAndEvaluate({
    memberRow: memberRow ?? null,
    todaySL: input.todaySL,
  });
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
