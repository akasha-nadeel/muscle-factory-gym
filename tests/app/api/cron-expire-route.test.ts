import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { POST } from "@/app/api/cron/expire-memberships/route";

const CLERK_PREFIX = "user_phase5_test_expireroute_";
const PLAN_NAME = "Phase5ExpireRoutePlan";

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

beforeEach(async () => {
  await clean();
  process.env.CRON_SECRET = "phase5-expire-route-secret";
});

afterEach(clean);

describe("POST /api/cron/expire-memberships", () => {
  it("returns 401 without the bearer header", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/expire-memberships", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/expire-memberships", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 + summary on correct bearer and flips a stale row", async () => {
    const [pl] = await db
      .insert(plans)
      .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
      .returning();
    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}member`,
        email: "exproute@x.lk",
        fullName: "Expire Route Member",
        role: "member",
        status: "active",
      })
      .returning();
    const [mem] = await db
      .insert(memberships)
      .values({
        memberId: m.id,
        planId: pl.id,
        startDate: "2026-01-01",
        endDate: "2026-05-15",
        status: "active",
      })
      .returning();

    const res = await POST(
      new Request("http://localhost/api/cron/expire-memberships", {
        method: "POST",
        headers: { authorization: "Bearer phase5-expire-route-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { flipped: number };
    expect(typeof json.flipped).toBe("number");
    expect(json.flipped).toBeGreaterThanOrEqual(1);

    const [reloaded] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, mem.id));
    expect(reloaded.status).toBe("expired");
  });
});
