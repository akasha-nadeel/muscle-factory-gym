import { db as defaultDb } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Draws the next gym ID from the `gym_id_seq` Postgres sequence. Monotonic —
 * wiped/freed gym IDs are NOT reused. Range [1000, 9999], throws when
 * exhausted.
 *
 * The sequence is created in `drizzle/0008_gym_id_sequence.sql` and is
 * `OWNED BY profiles.gym_id` so it follows the column's lifecycle.
 *
 * Pass a transaction (`tx`) when calling from inside `db.transaction(...)`,
 * otherwise pass the default `db` import.
 */
// Accept either the default db OR a transaction handle from db.transaction(...).
// Derived from the transaction callback's parameter so it stays correct if
// Drizzle's transaction signature evolves.
type DbLike =
  | typeof defaultDb
  | Parameters<Parameters<typeof defaultDb["transaction"]>[0]>[0];

export async function _assignNextGymIdUnsafe(dbOrTx: DbLike): Promise<number> {
  let result: unknown;
  try {
    result = await dbOrTx.execute(sql`SELECT nextval('gym_id_seq') AS id`);
  } catch (err) {
    // Postgres throws "nextval: reached maximum value of sequence" when exhausted.
    // Drizzle wraps driver errors in DrizzleQueryError("Failed query: ...") with
    // the original on `.cause`, so check both layers.
    const messages: string[] = [];
    if (err instanceof Error) {
      messages.push(err.message);
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof Error) messages.push(cause.message);
    }
    if (messages.some((m) => /reached maximum value/i.test(m))) {
      throw new Error("Gym ID range exhausted (1000-9999 all assigned)");
    }
    throw err;
  }

  // postgres-js returns rows either as an array directly or wrapped in
  // { rows: [] } depending on driver version. Mirror the idiom from
  // src/lib/cron/wipe.ts.
  const rawRows =
    (result as { rows?: unknown[] }).rows ??
    (result as unknown[]);
  const row = Array.isArray(rawRows)
    ? (rawRows[0] as { id?: string | number } | undefined)
    : undefined;
  // nextval returns bigint, which some drivers surface as a string — coerce.
  const next = row ? Number(row.id) : NaN;
  if (!Number.isFinite(next)) {
    throw new Error("nextval('gym_id_seq') returned an unexpected value");
  }
  return next;
}
