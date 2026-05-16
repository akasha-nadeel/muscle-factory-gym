import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { POST } from "@/app/api/cron/inactivate-stale-members/route";

const CLERK_PREFIX = "user_phase5_test_inactivateroute_";

async function clean() {
  const rows = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const r of rows) {
    await db.delete(attendance).where(eq(attendance.memberId, r.id));
  }
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(async () => {
  await clean();
  process.env.CRON_SECRET = "phase5-inactivate-route-secret";
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

  it("returns 200 + summary and flips a stale member", async () => {
    const oldCreatedAt = new Date();
    oldCreatedAt.setUTCDate(oldCreatedAt.getUTCDate() - 250);

    const [m] = await db
      .insert(profiles)
      .values({
        clerkUserId: `${CLERK_PREFIX}ghost`,
        email: "inact-route@x.lk",
        fullName: "Inactivate Route Member",
        role: "member",
        status: "active",
        createdAt: oldCreatedAt,
      })
      .returning();

    const res = await POST(
      new Request(
        "http://localhost/api/cron/inactivate-stale-members",
        {
          method: "POST",
          headers: {
            authorization: "Bearer phase5-inactivate-route-secret",
          },
        },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { flipped: number };
    expect(typeof json.flipped).toBe("number");
    expect(json.flipped).toBeGreaterThanOrEqual(1);

    const [reloaded] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, m.id));
    expect(reloaded.status).toBe("inactive");
  });
});
