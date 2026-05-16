import { db } from "@/db";
import { profiles, plans } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ApproveButton } from "./_approve-button";
import { AdminPage } from "@/components/admin/admin-page";

export default async function PendingPage() {
  await requireAdminProfile();
  const pending = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.role, "member"), eq(profiles.status, "pending")))
    .orderBy(desc(profiles.createdAt));

  const activePlans = await db
    .select({ id: plans.id, name: plans.name, durationDays: plans.durationDays, priceLkr: plans.priceLkr })
    .from(plans)
    .where(eq(plans.isActive, true));

  return (
    <AdminPage breadcrumbs={[{ label: "Pending" }]}>
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Pending approvals</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-40">Signed up</TableHead>
            <TableHead className="w-40 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                No pending approvals.
              </TableCell>
            </TableRow>
          )}
          {pending.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.fullName}</TableCell>
              <TableCell>{m.email}</TableCell>
              <TableCell>{format(m.createdAt, "PP")}</TableCell>
              <TableCell className="text-right">
                <ApproveButton
                  memberId={m.id}
                  memberName={m.fullName}
                  plans={activePlans}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </AdminPage>
  );
}
