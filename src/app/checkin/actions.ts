"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { memberships, payments, plans, profiles } from "@/db/schema";
import { todayInSL } from "@/lib/tz";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";
import {
  _evaluateByGymIdUnsafe,
  _recordAttendanceByMemberIdUnsafe,
} from "@/lib/checkin/record";
import type { CheckinResult } from "@/lib/checkin/evaluate";
import { signKioskToken } from "@/lib/qr/token";
import { computeOutstanding } from "@/lib/payments/outstanding";
import {
  inferCyclePeriod,
  computeNextPaymentDue,
  computeLastMissedDueDate,
} from "@/lib/payments/next-due";

export type CheckinMember = {
  memberId: string;
  fullName: string;
  photoUrl: string | null;
  gymId: number | null;
  planName: string;
  expiresOn: string;
  daysRemaining: number;
  outstandingLkr: string;
  /** Calendar-aware next payment due (e.g. Oct 5 + 1 month = Nov 5). */
  nextPaymentDue: string | null;
  /** Most recently missed due date (null if not yet past any). */
  lastMissedDue: string | null;
};

export type SubmitGymIdResult =
  | { ok: true; member: CheckinMember }
  | {
      ok: false;
      reason:
        | "invalid_format"
        | "not_found"
        | "pending_approval"
        | "inactive"
        | "no_active_membership"
        | "already_checked_in_today"
        | "db_error";
    };

/**
 * Enrich a successful eval result with cycle-aware financials (outstanding +
 * due dates) so the kiosk can warn an overdue member. Shared by the preview
 * and confirm steps so both render identical member detail.
 */
async function withFinancials(
  m: Extract<CheckinResult, { ok: true }>["member"],
  todaySL: string,
): Promise<CheckinMember> {
  const [mem] = await db
    .select({
      id: memberships.id,
      startDate: memberships.startDate,
      planPriceLkr: plans.priceLkr,
      planName: plans.name,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.id, m.membershipId))
    .limit(1);
  const payRows = await db
    .select()
    .from(payments)
    .where(eq(payments.memberId, m.memberId));

  // Cycle-aware outstanding: 0 for a member paid up for the current cycle,
  // rising by one cycle's price on each due day they haven't paid.
  const outstandingLkr = mem
    ? computeOutstanding({
        planPriceLkr: mem.planPriceLkr,
        payments: payRows.map((p) => ({
          id: p.id,
          amountLkr: p.amountLkr,
          kind: p.kind,
          status: p.status,
          membershipId: p.membershipId,
        })),
        membershipId: mem.id,
        cycleContext: {
          startDate: mem.startDate,
          today: todaySL,
          cyclePeriod: inferCyclePeriod(mem.planName),
        },
      })
    : "0";
  const cyclePeriod = mem ? inferCyclePeriod(mem.planName) : null;
  const nextPaymentDue =
    mem && cyclePeriod
      ? computeNextPaymentDue({
          membershipStart: mem.startDate,
          cyclePeriod,
          today: todaySL,
        })
      : null;
  const lastMissedDue =
    mem && cyclePeriod
      ? computeLastMissedDueDate({
          membershipStart: mem.startDate,
          cyclePeriod,
          today: todaySL,
        })
      : null;

  return {
    memberId: m.memberId,
    fullName: m.fullName,
    photoUrl: m.photoUrl,
    gymId: m.gymId,
    planName: m.planName,
    expiresOn: m.expiresOn,
    daysRemaining: m.daysRemaining,
    outstandingLkr,
    nextPaymentDue,
    lastMissedDue,
  };
}

/**
 * Replace the member's DB-stored photo with their CURRENT Clerk avatar.
 *
 * The DB `photoUrl` only updates via the Clerk `user.updated` webhook, which
 * lags in production and never fires on localhost — so a member who just
 * changed their photo in the portal would still see the old one at the kiosk.
 * Reading it live from Clerk keeps the confirm screen in sync. Non-fatal: any
 * failure (Clerk unreachable, user missing) falls back to the DB value.
 *
 * Applied only in the public entry points below — NOT in withFinancials —
 * so the `_*Unsafe` test helpers never make Clerk API calls.
 */
async function withLivePhoto(member: CheckinMember): Promise<CheckinMember> {
  try {
    const [prof] = await db
      .select({ clerkUserId: profiles.clerkUserId })
      .from(profiles)
      .where(eq(profiles.id, member.memberId))
      .limit(1);
    if (prof?.clerkUserId) {
      const client = await clerkClient();
      const u = await client.users.getUser(prof.clerkUserId);
      return { ...member, photoUrl: normalizeAvatarUrl(u.imageUrl) };
    }
  } catch (e) {
    console.warn("checkin: live Clerk photo fetch failed; using DB photo", e);
  }
  return member;
}

function parseGymId(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (n < 1000 || n > 9999) return null;
  return n;
}

/**
 * STEP 1 (read-only). Resolve a typed Gym ID to a member and evaluate
 * eligibility WITHOUT recording attendance. The kiosk shows the returned
 * photo + name so the member can confirm it's really them before committing.
 * Test-only entry point (explicit todaySL, no revalidate).
 */
export async function _previewGymIdUnsafe(input: {
  gymIdRaw: string;
  todaySL: string;
}): Promise<SubmitGymIdResult> {
  const n = parseGymId(input.gymIdRaw);
  if (n === null) return { ok: false, reason: "invalid_format" };
  try {
    const r = await _evaluateByGymIdUnsafe({
      gymId: n,
      todaySL: input.todaySL,
    });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, member: await withFinancials(r.member, input.todaySL) };
  } catch (e) {
    console.error("previewGymId db error", e);
    return { ok: false, reason: "db_error" };
  }
}

/**
 * STEP 2 (write). Commit the check-in for the member the user confirmed in
 * step 1, keyed by the resolved memberId (never the re-typed number). Re-runs
 * the full eligibility evaluation so the once-per-day guard stays honest even
 * if state changed between preview and confirm. Test-only entry point.
 */
export async function _confirmCheckinUnsafe(input: {
  memberId: string;
  todaySL: string;
}): Promise<SubmitGymIdResult> {
  try {
    const r = await _recordAttendanceByMemberIdUnsafe({
      memberId: input.memberId,
      todaySL: input.todaySL,
      source: "kiosk_id",
    });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, member: await withFinancials(r.member, input.todaySL) };
  } catch (e) {
    console.error("confirmCheckin db error", e);
    return { ok: false, reason: "db_error" };
  }
}

/** Step 1 form entry — called from the kiosk client component. No write. */
export async function previewGymId(
  gymIdRaw: string,
): Promise<SubmitGymIdResult> {
  const result = await _previewGymIdUnsafe({ gymIdRaw, todaySL: todayInSL() });
  if (result.ok) {
    return { ok: true, member: await withLivePhoto(result.member) };
  }
  return result;
}

/** Step 2 form entry — records attendance after the member confirms. */
export async function confirmCheckin(
  memberId: string,
): Promise<SubmitGymIdResult> {
  const result = await _confirmCheckinUnsafe({ memberId, todaySL: todayInSL() });
  if (result.ok) {
    revalidatePath(`/admin/members/${result.member.memberId}`);
    revalidatePath("/portal");
    return { ok: true, member: await withLivePhoto(result.member) };
  }
  return result;
}

/** Returns a fresh signed kiosk token for the QR. Public — no auth gate. */
export async function getFreshKioskToken(): Promise<string> {
  const secret = process.env.QR_SECRET;
  if (!secret) throw new Error("QR_SECRET is not set");
  return signKioskToken({
    kioskId: "main",
    now: new Date(),
    secret,
  });
}
