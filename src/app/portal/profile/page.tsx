import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { memberships, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentMembership } from "@/lib/memberships/current";
import { todayInSL } from "@/lib/tz";
import { daysRemaining } from "@/lib/days-remaining";
import { ProfileForm } from "./_form";

export default async function ProfilePage() {
  const me = await requireMemberProfile();
  // Defensive: same stale-session protection as the portal home — see comment
  // there for details.
  if (me.role === "admin") redirect("/admin");

  // Clerk's imageUrl is always populated — either the user's uploaded photo,
  // their OAuth provider photo, or a Clerk-generated initial avatar (same one
  // shown in the <UserButton> top-right). Reusing it keeps the profile hero
  // identical to the header.
  const clerkUser = await currentUser();
  const avatarUrl = clerkUser?.imageUrl ?? me.photoUrl ?? null;

  const history = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planName: plans.name,
      planPriceLkr: plans.priceLkr,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.memberId, me.id))
    .orderBy(desc(memberships.endDate));

  const today = todayInSL();
  const current = getCurrentMembership(history, today);
  const daysLeft = current
    ? Math.max(0, daysRemaining({ today, endDate: current.endDate }))
    : null;

  return (
    <ProfileForm
      key={`${me.fullName}::${me.phone ?? ""}`}
      initial={{ fullName: me.fullName, phone: me.phone ?? "" }}
      profile={{
        email: me.email,
        gymId: me.gymId,
        status: me.status,
        photoUrl: avatarUrl,
        createdAt: me.createdAt,
      }}
      membership={
        current
          ? {
              planName: current.planName,
              startDate: current.startDate,
              endDate: current.endDate,
              // membership.status is one of: 'active' | 'expired' | 'cancelled'
              // — all valid StatusVariant values.
              status: current.status as "active" | "expired" | "cancelled",
              daysLeft: daysLeft ?? 0,
            }
          : null
      }
    />
  );
}
