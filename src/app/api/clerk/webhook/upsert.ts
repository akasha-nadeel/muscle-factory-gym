import { db } from "@/db";
import { profiles } from "@/db/schema";
import { decideRoleAndStatus } from "@/lib/role-decision";
import { sql } from "drizzle-orm";

export type ClerkUpsertInput = {
  clerkUserId: string;
  email: string;
  fullName: string;
  adminEmailsCsv: string | undefined;
};

export async function upsertProfileFromClerk(input: ClerkUpsertInput) {
  const { role, status } = decideRoleAndStatus(
    input.email,
    input.adminEmailsCsv,
  );
  await db
    .insert(profiles)
    .values({
      clerkUserId: input.clerkUserId,
      email: input.email,
      fullName: input.fullName,
      role,
      status,
    })
    .onConflictDoUpdate({
      target: profiles.clerkUserId,
      set: {
        email: input.email,
        fullName: input.fullName,
        updatedAt: sql`now()`,
      },
    });
}
