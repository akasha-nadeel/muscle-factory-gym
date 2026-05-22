"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, payments, plans } from "@/db/schema";
import { todayInSL } from "@/lib/tz";
import {
  _recordAttendanceByGymIdUnsafe,
} from "@/lib/checkin/record";
import { signKioskToken } from "@/lib/qr/token";
import { computeOutstanding } from "@/lib/payments/outstanding";
import {
  inferCyclePeriod,
  computeNextPaymentDue,
} from "@/lib/payments/next-due";

export type SubmitGymIdResult =
  | {
      ok: true;
      member: {
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
      };
    }
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

/** Test-only entry point. No revalidatePath. */
export async function _submitGymIdUnsafe(input: {
  gymIdRaw: string;
  todaySL: string;
}): Promise<SubmitGymIdResult> {
  const trimmed = input.gymIdRaw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, reason: "invalid_format" };
  }
  const n = Number(trimmed);
  if (n < 1000 || n > 9999) {
    return { ok: false, reason: "invalid_format" };
  }
  try {
    const r = await _recordAttendanceByGymIdUnsafe({
      gymId: n,
      todaySL: input.todaySL,
      source: "kiosk_id",
    });
    if (!r.ok) return { ok: false, reason: r.reason };

    // Compute outstanding for the current membership so the kiosk can
    // warn the member at check-in time. One extra round-trip — cheap.
    const [mem] = await db
      .select({
        id: memberships.id,
        startDate: memberships.startDate,
        planPriceLkr: plans.priceLkr,
        planName: plans.name,
      })
      .from(memberships)
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.id, r.member.membershipId))
      .limit(1);
    const payRows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, r.member.memberId));
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
        })
      : "0";
    const nextPaymentDue = mem
      ? computeNextPaymentDue({
          membershipStart: mem.startDate,
          cyclePeriod: inferCyclePeriod(mem.planName),
          today: input.todaySL,
        })
      : null;

    return {
      ok: true,
      member: {
        memberId: r.member.memberId,
        fullName: r.member.fullName,
        photoUrl: r.member.photoUrl,
        gymId: r.member.gymId,
        planName: r.member.planName,
        expiresOn: r.member.expiresOn,
        daysRemaining: r.member.daysRemaining,
        outstandingLkr,
        nextPaymentDue,
      },
    };
  } catch (e) {
    console.error("submitGymId db error", e);
    return { ok: false, reason: "db_error" };
  }
}

/** Form-action wrapper called from the kiosk client component. */
export async function submitGymId(
  _prev: SubmitGymIdResult | undefined,
  formData: FormData,
): Promise<SubmitGymIdResult> {
  const gymIdRaw = String(formData.get("gymId") ?? "");
  const result = await _submitGymIdUnsafe({
    gymIdRaw,
    todaySL: todayInSL(),
  });
  if (result.ok) {
    revalidatePath(`/admin/members/${result.member.memberId}`);
    revalidatePath("/portal");
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
