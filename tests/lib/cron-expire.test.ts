import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { _expireStaleMembershipsUnsafe } from "@/lib/cron/expire";

const CLERK_PREFIX = "user_phase5_test_expire_";
const PLAN_NAME = "Phase5ExpirePlan";

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

let memberId: string;
let planId: string;

beforeEach(async () => {
  await clean();
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  planId = pl.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "expire@x.lk",
      fullName: "Expire Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
});

afterEach(clean);

async function seedMembership(opts: {
  status: "active" | "expired" | "cancelled";
  endDate: string;
}) {
  const [row] = await db
    .insert(memberships)
    .values({
      memberId,
      planId,
      startDate: "2026-01-01",
      endDate: opts.endDate,
      status: opts.status,
    })
    .returning();
  return row.id;
}

describe("_expireStaleMembershipsUnsafe", () => {
  it("flips an active membership with a past end_date to expired", async () => {
    const id = await seedMembership({
      status: "active",
      endDate: "2026-05-15",
    });
    const result = await _expireStaleMembershipsUnsafe({
      todaySL: "2026-05-16",
    });
    expect(result.flipped).toBeGreaterThanOrEqual(1);
    const [row] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, id));
    expect(row.status).toBe("expired");
  });

  it("leaves an active membership with a future end_date alone", async () => {
    const id = await seedMembership({
      status: "active",
      endDate: "2026-06-20",
    });
    await _expireStaleMembershipsUnsafe({ todaySL: "2026-05-16" });
    const [row] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, id));
    expect(row.status).toBe("active");
  });

  it("does not re-flip a membership that is already expired", async () => {
    const id = await seedMembership({
      status: "expired",
      endDate: "2026-01-15",
    });
    const before = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, id));
    const beforeStatus = before[0].status;
    const result = await _expireStaleMembershipsUnsafe({
      todaySL: "2026-05-16",
    });
    const [after] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, id));
    expect(after.status).toBe("expired");
    expect(after.status).toBe(beforeStatus);
    expect(result.flipped).toBeGreaterThanOrEqual(0);
  });
});
