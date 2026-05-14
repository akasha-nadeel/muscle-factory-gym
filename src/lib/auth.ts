import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

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

/**
 * For server actions / route handlers that mutate as an admin. Re-checks role
 * AND fetches the profile row so the caller has the admin's profile id
 * (for createdBy / recordedBy audit columns).
 */
export async function requireAdminProfile(): Promise<Profile> {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  if (u.role !== "admin") redirect("/portal");
  const profile = await getProfileByClerkId(u.userId);
  if (!profile) {
    throw new Error(
      "admin session has no matching profile row — webhook never fired?",
    );
  }
  return profile;
}

export async function requireMemberProfile(): Promise<Profile> {
  const u = await getCurrentUser();
  if (!u) redirect("/sign-in");
  const profile = await getProfileByClerkId(u.userId);
  if (!profile) {
    throw new Error(
      "member session has no matching profile row — webhook never fired?",
    );
  }
  return profile;
}
