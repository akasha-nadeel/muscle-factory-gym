import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computeDbUsage, type DbUsage } from "./db-usage";

/**
 * Live on-disk size of the connected Postgres database via pg_database_size().
 * Reflects whatever DATABASE_URL points at — production when deployed on
 * Vercel, the dev DB locally. Close proxy for Supabase's dashboard "Database
 * size" figure (both measure the database's disk footprint); the two can
 * differ by a few MB.
 *
 * Wrapped in React `cache()` so the sidebar and top bar (both rendered in the
 * same request) share a single query instead of issuing two.
 */
export const getDatabaseUsage = cache(async (): Promise<DbUsage> => {
  const res = await db.execute(
    sql`SELECT pg_database_size(current_database()) AS bytes`,
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
