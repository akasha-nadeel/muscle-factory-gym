import { db } from "@/db";
import { memberships } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Mailer } from "@/lib/email/mailer";
import { renderEmail } from "@/lib/email/render";
import {
  decideReminder,
  type DecideMember,
  type DecideMembership,
  type ReminderKind,
} from "@/lib/email/decide-reminder";
import { Reminder3dEmail } from "@/lib/email/templates/reminder-3d";
import { Reminder1dEmail } from "@/lib/email/templates/reminder-1d";
import { ReminderOverdueEmail } from "@/lib/email/templates/reminder-overdue";

export type ReminderSummary = {
  evaluated: number;
  sent_3d: number;
  sent_1d: number;
  sent_overdue: number;
  skipped: number;
  failed: number;
};

function subjectFor(kind: ReminderKind): string {
  switch (kind) {
    case "3d":
      return "Your gym membership ends in 3 days";
    case "1d":
      return "Your gym membership ends tomorrow";
    case "overdue":
      return "Your gym membership has expired";
  }
}

function templateFor(
  kind: ReminderKind,
  props: {
    memberName: string;
    planName: string;
    endDate: string;
    appUrl: string;
  },
) {
  switch (kind) {
    case "3d":
      return <Reminder3dEmail {...props} />;
    case "1d":
      return <Reminder1dEmail {...props} />;
    case "overdue":
      return <ReminderOverdueEmail {...props} />;
  }
}

async function stampForKind(
  kind: ReminderKind,
  membershipId: string,
  now: Date,
): Promise<void> {
  if (kind === "3d") {
    await db
      .update(memberships)
      .set({ reminder3dSentAt: now })
      .where(eq(memberships.id, membershipId));
  } else if (kind === "1d") {
    await db
      .update(memberships)
      .set({ reminder1dSentAt: now })
      .where(eq(memberships.id, membershipId));
  } else {
    await db
      .update(memberships)
      .set({ lastOverdueReminderAt: now })
      .where(eq(memberships.id, membershipId));
  }
}

export async function _sendRemindersUnsafe(input: {
  mailer: Mailer;
  todaySL: string;
  appUrl: string;
}): Promise<ReminderSummary> {
  const summary: ReminderSummary = {
    evaluated: 0,
    sent_3d: 0,
    sent_1d: 0,
    sent_overdue: 0,
    skipped: 0,
    failed: 0,
  };

  // Pull every active member's latest membership (by end_date desc) along
  // with the plan name. LEFT JOIN LATERAL so members with zero memberships
  // still appear (they get skipped by decideReminder).
  const rows = await db.execute(sql`
    SELECT
      p.id            AS member_id,
      p.email         AS member_email,
      p.full_name     AS member_name,
      p.status        AS member_status,
      p.role          AS member_role,
      m.id            AS membership_id,
      m.status        AS membership_status,
      m.end_date      AS membership_end_date,
      m.reminder_3d_sent_at,
      m.reminder_1d_sent_at,
      m.last_overdue_reminder_at,
      pl.name         AS plan_name
    FROM profiles p
    LEFT JOIN LATERAL (
      SELECT * FROM memberships
      WHERE member_id = p.id
      ORDER BY end_date DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN plans pl ON pl.id = m.plan_id
    WHERE p.status = 'active' AND p.role = 'member'
  `);

  // postgres-js returns rows as either an array directly or wrapped in
  // { rows: [] }. Handle both shapes (same pattern as Phase 5).
  const list =
    (rows as unknown as { rows?: unknown[] }).rows ??
    (rows as unknown as unknown[]);

  if (!Array.isArray(list)) return summary;

  for (const raw of list) {
    const r = raw as {
      member_id: string;
      member_email: string;
      member_name: string;
      member_status: "active" | "pending" | "inactive";
      member_role: "admin" | "member";
      membership_id: string | null;
      membership_status: "active" | "expired" | "cancelled" | null;
      membership_end_date: string | null;
      reminder_3d_sent_at: Date | null;
      reminder_1d_sent_at: Date | null;
      last_overdue_reminder_at: Date | null;
      plan_name: string | null;
    };
    summary.evaluated++;

    const member: DecideMember = {
      status: r.member_status,
      role: r.member_role,
    };
    const latest: DecideMembership | null =
      r.membership_id && r.membership_status && r.membership_end_date
        ? {
            status: r.membership_status,
            endDate: r.membership_end_date,
            reminder3dSentAt: r.reminder_3d_sent_at,
            reminder1dSentAt: r.reminder_1d_sent_at,
            lastOverdueReminderAt: r.last_overdue_reminder_at,
          }
        : null;

    const decision = decideReminder(member, latest, input.todaySL);
    if (decision.kind === null) {
      summary.skipped++;
      continue;
    }

    if (!r.member_email) {
      summary.failed++;
      console.warn(`[reminders] member ${r.member_id} has no email`);
      continue;
    }

    const html = await renderEmail(
      templateFor(decision.kind, {
        memberName: r.member_name,
        planName: r.plan_name ?? "your plan",
        endDate: r.membership_end_date ?? "",
        appUrl: input.appUrl,
      }),
    );

    const result = await input.mailer.send({
      to: r.member_email,
      subject: subjectFor(decision.kind),
      html,
    });

    if (!result.ok) {
      console.warn(
        `[reminders] ${r.member_email} ${decision.kind} send failed: ${result.error}`,
      );
      summary.failed++;
      continue;
    }

    // Send-then-stamp: only stamp when Resend confirmed.
    if (r.membership_id) {
      await stampForKind(decision.kind, r.membership_id, new Date());
    }

    if (decision.kind === "3d") summary.sent_3d++;
    else if (decision.kind === "1d") summary.sent_1d++;
    else if (decision.kind === "overdue") summary.sent_overdue++;
  }

  return summary;
}
