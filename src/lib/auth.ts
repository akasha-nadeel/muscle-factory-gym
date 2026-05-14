import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type Role = "admin" | "member";

export async function getCurrentUser() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  const role =
    (sessionClaims?.metadata as { role?: Role } | undefined)?.role ?? "member";
  return { userId, role };
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
