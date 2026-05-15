import { redirect } from "next/navigation";
import { requireMemberProfile } from "@/lib/auth";
import { db } from "@/db";
import { memberships, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentMembership } from "@/lib/memberships/current";
import { daysRemaining } from "@/lib/days-remaining";

export default async function PortalHome() {
  const me = await requireMemberProfile();

  // Admins shouldn't see the member portal — bounce them to the admin shell.
  if (me.role === "admin") redirect("/admin");

  if (me.status === "pending") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Welcome, {me.fullName} 👋</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Your account is awaiting approval. The gym staff will activate your
            membership shortly — you can come back to this page after.
          </p>
          <p>If you need to talk to someone, visit the front desk.</p>
        </CardContent>
      </Card>
    );
  }

  if (me.status === "inactive") {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Welcome back, {me.fullName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Your account is currently inactive (no recent visits). Please drop by
            the front desk and we'll reactivate your membership.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active member: show current membership.
  const history = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planName: plans.name,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.memberId, me.id));

  const today = format(new Date(), "yyyy-MM-dd");
  const current = getCurrentMembership(history, today);

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-2xl font-semibold">Welcome, {me.fullName}</h2>
      {current ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{current.planName}</span>
              <Badge>{current.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Valid:</span>{" "}
              {format(new Date(current.startDate), "PP")} – {format(new Date(current.endDate), "PP")}
            </div>
            <div>
              <span className="text-muted-foreground">Days remaining:</span>{" "}
              {Math.max(0, daysRemaining({ today, endDate: current.endDate }))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No active membership</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Please visit the front desk to renew, or wait for the online payment
            option (coming soon).
          </CardContent>
        </Card>
      )}
    </div>
  );
}
