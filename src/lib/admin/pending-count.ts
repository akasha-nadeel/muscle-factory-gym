import { db } from "@/db";
import { profiles } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";

export async function getPendingMemberCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(profiles)
    .where(and(eq(profiles.role, "member"), eq(profiles.status, "pending")));
  return Number(row?.value ?? 0);
}
