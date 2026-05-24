import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import {
  profiles,
  attendance,
  memberships,
  payments,
  workoutPlans,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/cron/inactivate-stale-members/route";

const CLERK_PREFIX = "user_phase5_test_wiperoute_";

const insertedProfileIds = new Set<string>();

async function clean() {
  const ids = [...insertedProfileIds];
  for (const id of ids) {
    await db.delete(workoutPlans).where(eq(workoutPlans.memberId, id));
    await db.delete(payments).where(eq(payments.memberId, id));
    await db.delete(memberships).where(eq(memberships.memberId, id));
    await db.delete(attendance).where(eq(attendance.memberId, id));
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  insertedProfileIds.clear();
}

beforeEach(async () => {
  await clean();
  process.env.CRON_SECRET = "phase5-wipe-route-secret";
});

afterEach(clean);

describe("POST /api/cron/inactivate-stale-members", () => {
  it("returns 401 without the bearer header", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/inactivate-stale-members", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/inactivate-stale-members", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 + summary and wipes a stale member", async () => {
    const oldCreatedAt = new Date();
    oldCreatedAt.setUTCDate(oldCreatedAt.getUTCDate() - 250);

    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}ghost`,
        email: "wipe-route@x.lk",
        fullName: "Wipe Route Member",
        role: "member",
        status: "active",
        createdAt: oldCreatedAt,
      })
      .returning();
    insertedProfileIds.add(m.id);

    const res = await POST(
      new Request("http://localhost/api/cron/inactivate-stale-members", {
        method: "POST",
        headers: {
          authorization: "Bearer phase5-wipe-route-secret",
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      wiped: number;
      storageErrors: number;
    };
    expect(typeof json.wiped).toBe("number");
    expect(json.wiped).toBeGreaterThanOrEqual(1);
    expect(json.storageErrors).toBe(0);

    const [reloaded] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(reloaded.status).toBe("inactive");
    expect(reloaded.email).toBeNull();
    expect(reloaded.phone).toBeNull();
    expect(reloaded.photoUrl).toBeNull();
    expect(reloaded.gymId).toBeNull();
    expect(reloaded.fullName).toBe("Former member");
    expect(reloaded.clerkUserId).toBe(`removed:${reloaded.id}`);
  });
});
