/**
 * Pure database-usage helpers — no DB/server imports, so this module is safe
 * to pull into client components (e.g. the mobile nav drawer). The live query
 * that reads the actual size lives in `./get-db-usage` (server-only).
 */

/**
 * Supabase Free-tier database-size cap (500 MB). When the database's on-disk
 * footprint reaches this, Supabase switches the project to read-only mode and
 * writes (new members, payments, check-ins) start failing — so it's worth
 * surfacing to the admin well before then.
 */
export const DB_SIZE_LIMIT_BYTES = 500 * 1024 * 1024;

export type DbUsage = {
  usedBytes: number;
  limitBytes: number;
  /** 0–100, rounded to one decimal and clamped at 100. */
  pct: number;
};

/** Turn a raw byte count into a usage summary against the limit. */
export function computeDbUsage(usedBytes: number): DbUsage {
  const pct =
    Math.round(Math.min(100, (usedBytes / DB_SIZE_LIMIT_BYTES) * 100) * 10) /
    10;
  return { usedBytes, limitBytes: DB_SIZE_LIMIT_BYTES, pct };
}

/** Compact human-friendly size, e.g. "27 MB", "1.5 MB", "2.00 GB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}
