import { db } from "@/db";
import { profiles, plans } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ApproveButton } from "./_approve-button";
import { RejectButton } from "./_reject-button";
import { AdminPage } from "@/components/admin/admin-page";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { EmptyState } from "@/components/admin/empty-state";
import { displayName } from "@/lib/profiles/display-name";
import { UserCheck } from "lucide-react";

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
      {pending.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={UserCheck}
            title="All caught up"
            description="No pending approvals right now."
          />
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          {/* Mobile cards */}
          <ul className="sm:hidden divide-y">
            {pending.map((m) => (
              <li key={m.id} className="p-3 flex items-center gap-3">
                <MemberAvatar
                  size="md"
                  fullName={m.fullName}
                  photoUrl={m.photoUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{displayName(m.fullName)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.email}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(m.createdAt, "PP")}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <RejectButton memberId={m.id} memberName={m.fullName} />
                  <ApproveButton
                    memberId={m.id}
                    memberName={m.fullName}
                    memberEmail={m.email}
                    memberPhotoUrl={m.photoUrl}
                    memberCreatedAt={m.createdAt}
                    plans={activePlans}
                  />
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-40">Signed up</TableHead>
                  <TableHead className="w-40 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <MemberAvatar
                        size="sm"
                        fullName={m.fullName}
                        photoUrl={m.photoUrl}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{displayName(m.fullName)}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{format(m.createdAt, "PP")}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <RejectButton
                          memberId={m.id}
                          memberName={m.fullName}
                        />
                        <ApproveButton
                          memberId={m.id}
                          memberName={m.fullName}
                          memberEmail={m.email}
                          memberPhotoUrl={m.photoUrl}
                          memberCreatedAt={m.createdAt}
                          plans={activePlans}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
    </AdminPage>
  );
}
