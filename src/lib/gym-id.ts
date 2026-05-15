import { db as defaultDb } from "@/db";
import { profiles } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Picks the next free Gym ID in [1000, 9999]. Returns 1000 if no profile
 * has a Gym ID yet. Throws if the range is exhausted.
 *
 * Pass a transaction (`tx`) when calling from inside `db.transaction(...)`,
 * otherwise pass the default `db` import.
 */
type DbLike = typeof defaultDb;

export async function _assignNextGymIdUnsafe(dbOrTx: DbLike): Promise<number> {
  const rows = await dbOrTx
    .select({ maxId: sql<number | null>`max(${profiles.gymId})` })
    .from(profiles);
  const current = rows[0]?.maxId ?? null;
  const next = current === null ? 1000 : current + 1;
  if (next > 9999) {
    throw new Error("Gym ID range exhausted (1000-9999 all assigned)");
  }
  return next;
}
