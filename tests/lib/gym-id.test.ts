import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { like, sql } from "drizzle-orm";
import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

const CLERK_PREFIX = "user_phase3_gymid_";

async function clean() {
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(clean);
afterEach(clean);

async function currentMax(): Promise<number | null> {
  const rows = await db
    .select({ m: sql<number | null>`max(${profiles.gymId})` })
    .from(profiles);
  return rows[0]?.m ?? null;
}

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
  it("returns MAX(gym_id) + 1 (or 1000 when table is empty)", async () => {
    const baseline = await currentMax();
    const next = await _assignNextGymIdUnsafe(db);
    if (baseline === null) {
      expect(next).toBe(1000);
    } else {
      expect(next).toBe(baseline + 1);
    }
  });

  it("returns MAX(gym_id) + 1 after inserts above the current baseline", async () => {
    const baseline = (await currentMax()) ?? 999;
    const offset = baseline + 100; // safely above any real data
    await insertMember("a", offset);
    await insertMember("b", offset + 5);
    const next = await _assignNextGymIdUnsafe(db);
    expect(next).toBe(offset + 6);
  });

  it("ignores profiles inserted with null gym_id", async () => {
    const baselineBefore = await currentMax();
    await insertMember("pending1", null);
    await insertMember("pending2", null);
    const next = await _assignNextGymIdUnsafe(db);
    if (baselineBefore === null) {
      expect(next).toBe(1000);
    } else {
      expect(next).toBe(baselineBefore + 1);
    }
  });

  it("throws if MAX(gym_id) reaches 9999", async () => {
    await insertMember("max", 9999);
    await expect(_assignNextGymIdUnsafe(db)).rejects.toThrow(/exhausted/i);
  });
});
