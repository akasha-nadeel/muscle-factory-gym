import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _sendRemindersUnsafe } from "@/lib/cron/send-reminders";
import type { Mailer, SendOpts, SendResult } from "@/lib/email/mailer";

const CLERK_PREFIX = "user_phase6_test_reminders_";
const PLAN_NAME = "Phase6ReminderPlan";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let planId: string;

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  planId = pl.id;
});

afterEach(clean);

type RecordedSend = SendOpts;

function makeFakeMailer(
  response: SendResult | ((opts: SendOpts) => SendResult) = { ok: true },
): { mailer: Mailer; sent: RecordedSend[] } {
  const sent: RecordedSend[] = [];
  const mailer: Mailer = {
    async send(opts) {
      sent.push(opts);
      return typeof response === "function" ? response(opts) : response;
    },
  };
  return { mailer, sent };
}

async function insertMember(suffix: string, status: "active" | "pending" | "inactive" = "active") {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${suffix}`,
      email: `${suffix}@x.lk`,
      fullName: `Reminder ${suffix}`,
      role: "member",
      status,
    })
    .returning();
  return row;
}

async function insertMembership(
  memberId: string,
  opts: {
    status: "active" | "expired" | "cancelled";
    startDate: string;
    endDate: string;
  },
) {
  const [row] = await db
    .insert(memberships)
    .values({
      memberId,
      planId,
      startDate: opts.startDate,
      endDate: opts.endDate,
      status: opts.status,
    })
    .returning();
  return row;
}

// React Email's render() spins up react-dom/server and is slow on first call.
// Bump the suite timeout so the multi-template tests don't flake.
describe("_sendRemindersUnsafe", { timeout: 30_000 }, () => {
  it("sends 3 different reminders to 3 members in their respective windows", async () => {
    const m3d = await insertMember("threeday");
    const m1d = await insertMember("oneday");
    const mover = await insertMember("overdue");
    await insertMembership(m3d.id, {
      status: "active",
      startDate: "2026-04-20",
      endDate: "2026-05-19", // 3 days from today=2026-05-16
    });
    await insertMembership(m1d.id, {
      status: "active",
      startDate: "2026-04-18",
      endDate: "2026-05-17", // 1 day from today
    });
    await insertMembership(mover.id, {
      status: "expired",
      startDate: "2026-04-01",
      endDate: "2026-05-10", // expired
    });

    const { mailer, sent } = makeFakeMailer({ ok: true });
    const summary = await _sendRemindersUnsafe({
      mailer,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });

    expect(summary.sent_3d).toBe(1);
    expect(summary.sent_1d).toBe(1);
    expect(summary.sent_overdue).toBe(1);
    expect(summary.failed).toBe(0);
    expect(sent.length).toBe(3);

    // Stamps should be set
    const memberships3d = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, m3d.id));
    expect(memberships3d[0].reminder3dSentAt).not.toBeNull();
    const memberships1d = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, m1d.id));
    expect(memberships1d[0].reminder1dSentAt).not.toBeNull();
    const membershipsOver = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, mover.id));
    expect(membershipsOver[0].lastOverdueReminderAt).not.toBeNull();
  });

  it("does not stamp when the mailer returns failure", async () => {
    const m = await insertMember("failsend");
    await insertMembership(m.id, {
      status: "active",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
    });
    const { mailer, sent } = makeFakeMailer({
      ok: false,
      error: "Resend rate limit",
    });
    const summary = await _sendRemindersUnsafe({
      mailer,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });

    expect(summary.failed).toBe(1);
    expect(summary.sent_3d).toBe(0);
    expect(sent.length).toBe(1);

    const [row] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.memberId, m.id));
    expect(row.reminder3dSentAt).toBeNull(); // not stamped
  });

  it("is idempotent on re-run (stamps prevent re-fire)", async () => {
    const m = await insertMember("idemp");
    await insertMembership(m.id, {
      status: "active",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
    });

    const { mailer: m1, sent: s1 } = makeFakeMailer({ ok: true });
    await _sendRemindersUnsafe({
      mailer: m1,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });
    expect(s1.length).toBe(1);

    const { mailer: m2, sent: s2 } = makeFakeMailer({ ok: true });
    const summary2 = await _sendRemindersUnsafe({
      mailer: m2,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });
    expect(s2.length).toBe(0);
    expect(summary2.sent_3d).toBe(0);
  });

  it("skips inactive members", async () => {
    const m = await insertMember("inactive", "inactive");
    await insertMembership(m.id, {
      status: "active",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
    });

    const { mailer, sent } = makeFakeMailer({ ok: true });
    await _sendRemindersUnsafe({
      mailer,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });

    expect(sent.length).toBe(0);
  });

  it("evaluates all active members and skips those not in a window", async () => {
    const eligible = await insertMember("eligible");
    await insertMembership(eligible.id, {
      status: "active",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
    });
    const tooEarly = await insertMember("toofar");
    await insertMembership(tooEarly.id, {
      status: "active",
      startDate: "2026-05-01",
      endDate: "2026-06-30",
    });
    const noMembership = await insertMember("nomembership");

    const { mailer, sent } = makeFakeMailer({ ok: true });
    const summary = await _sendRemindersUnsafe({
      mailer,
      todaySL: "2026-05-16",
      appUrl: "https://gym.example",
    });

    expect(summary.evaluated).toBeGreaterThanOrEqual(3);
    expect(summary.sent_3d).toBe(1);
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("eligible@x.lk");
  });
});
