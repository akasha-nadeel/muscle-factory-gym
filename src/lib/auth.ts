import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
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
  const claimedRole = (sessionClaims?.metadata as { role?: Role } | undefined)
    ?.role;
  if (claimedRole) return { userId, role: claimedRole };
  // Clerk session claims can lag for a few seconds after sign-in — the JWT
  // doesn't yet carry public_metadata.role even though the user is an admin
  // in our DB. Without this fallback, the missing claim defaults to "member"
  // and a logged-in admin gets caught in a /portal → /admin → /portal loop
  // (each redirect re-reading the same stale claims). One DB query during
  // the stale window breaks the loop; once claims refresh, this branch is
  // never taken.
  const profile = await getProfileByClerkId(userId);
  return { userId, role: (profile?.role ?? "member") as Role };
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
  // Admins land here briefly when Clerk's after-sign-in URL points at /portal.
  // Redirect at the layout level so they never see the portal chrome.
  if (u.role === "admin") redirect("/admin");
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
  const profile = await _syncProfileFromClerkUnsafe(
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
  // Mirror role/status to Clerk publicMetadata so the next session JWT
  // (after the user signs out + back in) carries the right role. The current
  // request's session claims won't update — we accept that, since this only
  // matters for first-time admin onboarding without a working webhook.
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role: profile.role, status: profile.status },
    });
  } catch {
    // Non-fatal: the DB row is authoritative for this request. If Clerk
    // is down, we still return the profile and let middleware sort it out.
  }
  return profile;
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
