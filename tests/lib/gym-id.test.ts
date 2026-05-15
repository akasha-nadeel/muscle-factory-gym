import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { like } from "drizzle-orm";
import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

const CLERK_PREFIX = "user_phase3_gymid_";

async function clean() {
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(clean);
afterEach(clean);

async function insertMember(suffix: string, gymId: number | null) {
  const [row] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}${suffix}`,
      email: `${suffix}@x.lk`,
      fullName: `GymId Test ${suffix}`,
      role: "member",
      status: "active",
      gymId,
    })
    .returning();
  return row;
}

describe("_assignNextGymIdUnsafe", () => {
  it("returns 1000 when no profiles have a gym_id yet", async () => {
    const next = await _assignNextGymIdUnsafe(db);
    expect(next).toBe(1000);
  });

  it("returns MAX(gym_id) + 1 when some profiles have one", async () => {
    await insertMember("a", 1000);
    await insertMember("b", 1005);
    const next = await _assignNextGymIdUnsafe(db);
    expect(next).toBe(1006);
  });

  it("ignores profiles with null gym_id", async () => {
    await insertMember("pending1", null);
    await insertMember("pending2", null);
    const next = await _assignNextGymIdUnsafe(db);
    expect(next).toBe(1000);
  });

  it("throws if MAX(gym_id) reaches 9999", async () => {
    await insertMember("max", 9999);
    await expect(_assignNextGymIdUnsafe(db)).rejects.toThrow(/exhausted/i);
  });
});
