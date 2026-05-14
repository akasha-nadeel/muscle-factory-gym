import { notFound } from "next/navigation";
import { db } from "@/db";
import { profiles, memberships, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { getCurrentMembership } from "@/lib/memberships/current";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminProfile();
  const { id } = await params;

  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!member) notFound();

  const history = await db
    .select({
      id: memberships.id,
      status: memberships.status,
      startDate: memberships.startDate,
      endDate: memberships.endDate,
      planName: plans.name,
      planDuration: plans.durationDays,
    })
    .from(memberships)
    .innerJoin(plans, eq(memberships.planId, plans.id))
    .where(eq(memberships.memberId, id))
    .orderBy(desc(memberships.endDate));

  const today = format(new Date(), "yyyy-MM-dd");
  const current = getCurrentMembership(history, today);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold">{member.fullName}</h2>
          <p className="text-muted-foreground">{member.email}</p>
        </div>
        <Badge
          variant={
            member.status === "active"
              ? "default"
              : member.status === "pending"
                ? "secondary"
                : "outline"
          }
        >
          {member.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {member.phone ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Joined:</span>{" "}
              {format(member.createdAt, "PP")}
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span> {member.role}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current membership</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {current ? (
              <>
                <div className="font-medium">{current.planName}</div>
                <div className="text-muted-foreground">
                  {format(new Date(current.startDate), "PP")} –{" "}
                  {format(new Date(current.endDate), "PP")}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No active membership.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Membership history</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-6"
                >
                  No memberships yet.
                </TableCell>
              </TableRow>
            )}
            {history.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{h.planName}</TableCell>
                <TableCell>{format(new Date(h.startDate), "PP")}</TableCell>
                <TableCell>{format(new Date(h.endDate), "PP")}</TableCell>
                <TableCell>
                  <Badge
                    variant={h.status === "active" ? "default" : "outline"}
                  >
                    {h.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
