/**
 * One-off: dump the photoUrl + Clerk imageUrl for a specific email so we
 * can see whether the user has a real photo on Clerk's side or just a
 * generated initial.
 *
 *   npx tsx scripts/inspect-photo.ts <email>
 */
import "./_load-env";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { profiles } from "../src/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/inspect-photo.ts <email>");
    process.exit(1);
  }

  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (!row) {
    console.error(`No profile found for ${email}`);
    process.exit(1);
  }

  console.log("DB profile:");
  console.log("  clerkUserId:", row.clerkUserId);
  console.log("  photoUrl   :", row.photoUrl);
  console.log("");

  const client = await clerkClient();
  const u = await client.users.getUser(row.clerkUserId);
  console.log("Clerk user:");
  console.log("  imageUrl       :", u.imageUrl);
  console.log("  hasImage       :", u.hasImage);
  console.log("  externalAccounts:", u.externalAccounts.map((a) => a.provider));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
