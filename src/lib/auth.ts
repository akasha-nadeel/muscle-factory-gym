import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { upsertProfileFromClerk } from "@/app/api/clerk/webhook/upsert";

export type Role = "admin" | "member";
export type Profile = InferSelectModel<typeof profiles>;

export async function getCurrentUser() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const role =
    (sessionClaims?.metadata as { role?: Role } | undefined)?.role ?? "member";
  return { userId, role };
}

export async function getProfileByClerkId(
  clerkUserId: string,
): Promise<Profile | null> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  return getProfileByClerkId(u.userId);
}

export async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  if (u.role !== "admin") redirect("/portal");
  return u;
}

export async function requireMember() {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  return u;
}

type ClerkUserShape = {
  primaryEmail: string | null;
  firstName: string | null;
  lastName: string | null;
};

/**
 * Test-only helper: takes a pre-extracted Clerk user shape (not the live Clerk
 * session) and upserts a profile row if one doesn't exist yet. Used as a
 * fallback inside requireMemberProfile / requireAdminProfile when the webhook
 * hasn't synced this user yet (pre-existing accounts, webhook lag, etc).
 */
export async function _syncProfileFromClerkUnsafe(
  clerkUserId: string,
  clerkUser: ClerkUserShape,
  adminEmailsCsv: string | undefined,
): Promise<Profile> {
  const email = clerkUser.primaryEmail;
  if (!email) {
    throw new Error("Clerk user has no email address");
  }
  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    email;
  await upsertProfileFromClerk({
    clerkUserId,
    email,
    fullName,
    adminEmailsCsv,
  });
  const synced = await getProfileByClerkId(clerkUserId);
  if (!synced) {
    throw new Error("upsertProfileFromClerk did not create a row");
  }
  return synced;
}

async function _syncFromLiveClerkSession(
  clerkUserId: string,
): Promise<Profile> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return _syncProfileFromClerkUnsafe(
    clerkUserId,
    {
      primaryEmail:
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        null,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    process.env.ADMIN_EMAILS,
  );
}

/**
 * For server actions / route handlers that mutate as an admin. Re-checks role
 * AND fetches the profile row so the caller has the admin's profile id
 * (for createdBy / recordedBy audit columns).
 */
export async function requireAdminProfile(): Promise<Profile> {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  if (u.role !== "admin") redirect("/portal");
  let profile = await getProfileByClerkId(u.userId);
  if (!profile) profile = await _syncFromLiveClerkSession(u.userId);
  if (profile.role !== "admin") {
    // DB row says member even though session metadata said admin. DB wins.
    redirect("/portal");
  }
  return profile;
}

export async function requireMemberProfile(): Promise<Profile> {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  let profile = await getProfileByClerkId(u.userId);
  if (!profile) profile = await _syncFromLiveClerkSession(u.userId);
  return profile;
}
