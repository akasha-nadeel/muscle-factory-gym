// "Wiped" = a profile whose PII has been cleared after 180 days of inactivity.
import { sql } from "drizzle-orm";
import { profiles } from "@/db/schema";

export const WIPED_CLERK_PREFIX = "removed:";
export const WIPED_FULL_NAME = "Former member";

export function isWiped(p: { clerkUserId: string }): boolean {
  return p.clerkUserId.startsWith(WIPED_CLERK_PREFIX);
}

export const notWipedClause = sql`${profiles.clerkUserId} NOT LIKE 'removed:%'`;
