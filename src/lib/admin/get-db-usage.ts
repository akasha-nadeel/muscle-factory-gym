import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computeDbUsage, type DbUsage } from "./db-usage";

/**
 * Live on-disk size of the whole Postgres cluster the app is connected to,
 * summed across every database (the app's `postgres` DB plus the `template0`/
 * `template1` system databases). This matches the "Database size" figure
 * Supabase shows against the 500 MB free-tier limit — measuring only
 * current_database() under-counts by the ~15 MB of fixed system-template
 * overhead, making the gauge read low. Reflects whatever DATABASE_URL points
 * at (production on Vercel, the dev DB locally). Can still differ from
 * Supabase's number by a couple MB (WAL / reporting lag).
 *
 * Wrapped in React `cache()` so the sidebar and top bar (both rendered in the
 * same request) share a single query instead of issuing two.
 */
export const getDatabaseUsage = cache(async (): Promise<DbUsage> => {
  const res = await db.execute(
    sql`SELECT COALESCE(SUM(pg_database_size(datname)), 0) AS bytes FROM pg_database`,
  );
  // postgres-js returns rows either as an array directly or wrapped in
  // { rows: [] } depending on driver version — handle both.
  const rows =
    (res as unknown as { rows?: unknown[] }).rows ??
    (res as unknown as unknown[]);
  const first = (Array.isArray(rows) ? rows : [])[0] as
    | { bytes?: string | number | bigint }
    | undefined;
  return computeDbUsage(Number(first?.bytes ?? 0));
});
