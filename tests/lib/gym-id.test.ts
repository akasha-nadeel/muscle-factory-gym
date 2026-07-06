import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { like, sql } from "drizzle-orm";
import { _assignNextGymIdUnsafe } from "@/lib/gym-id";

const CLERK_PREFIX = "user_phase3_gymid_";

async function clean() {
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

// Reset `gym_id_seq` to a known baseline so each test starts deterministically:
// the next nextval() call returns MAX(gym_id)+1, or 1000 when no gym_id exists.
// NOTE: setval rejects a value below MINVALUE (1000), so on an empty table we
// set 1000 with is_called=false (next value = 1000 itself) rather than 999 with
// is_called=true. When gym_ids exist we set MAX with is_called=true (next =
// MAX+1). The old `GREATEST(999, …), true` form errored on a truly empty DB.
async function resetSequence() {
  await db.execute(sql`
    SELECT setval(
      'gym_id_seq',
      GREATEST(1000, COALESCE((SELECT MAX(gym_id) FROM profiles), 1000)),
      (SELECT EXISTS (SELECT 1 FROM profiles WHERE gym_id IS NOT NULL))
    )
  `);
}

beforeEach(async () => {
  await clean();
  await resetSequence();
});
afterEach(async () => {
  await clean();
  await resetSequence();
});

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
  it("returns next sequence value (or 1000 when table is empty)", async () => {
    const baseline = await currentMax();
    const next = await _assignNextGymIdUnsafe(db);
    if (baseline === null) {
      expect(next).toBe(1000);
    } else {
      expect(next).toBe(baseline + 1);
    }
  });

  it("returns next sequence value after inserts above the current baseline", async () => {
    const baseline = (await currentMax()) ?? 999;
    const offset = baseline + 100; // safely above any real data
    await insertMember("a", offset);
    await insertMember("b", offset + 5);
    // Manual INSERTs bypass the sequence, so the sequence has no idea those
    // gym IDs were taken. Bump it explicitly so nextval() returns offset+6.
    await db.execute(sql`SELECT setval('gym_id_seq', ${offset + 5}, true)`);
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

  it("throws if sequence reaches 9999", async () => {
    // Park the sequence at its MAXVALUE — the next nextval() call should
    // raise "reached maximum value", which gym-id.ts converts to the
    // exhausted-range message.
    await db.execute(sql`SELECT setval('gym_id_seq', 9999, true)`);
    await expect(_assignNextGymIdUnsafe(db)).rejects.toThrow(/exhausted/i);
    // afterEach's resetSequence() restores the sequence so subsequent tests
    // (in this file or run back-to-back) are not poisoned.
  });

  it("is monotonic across calls — never returns a value seen before", async () => {
    const a = await _assignNextGymIdUnsafe(db);
    const b = await _assignNextGymIdUnsafe(db);
    const c = await _assignNextGymIdUnsafe(db);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
