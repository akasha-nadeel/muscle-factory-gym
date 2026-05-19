import Link from "next/link";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { and, eq, ilike, or, count, desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MemberFilters } from "./_filters";
import { AdminPage } from "@/components/admin/admin-page";
import { StatusPill } from "@/components/admin/status-pill";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { EmptyState } from "@/components/admin/empty-state";
import { Users } from "lucide-react";

const PAGE_SIZE = 25;

type SearchParams = {
  status?: string;
  q?: string;
  page?: string;
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminProfile();
  const sp = await searchParams;

  const status =
    sp.status === "pending" || sp.status === "active" || sp.status === "inactive"
      ? sp.status
      : undefined;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const filters = [eq(profiles.role, "member")];
  if (status) filters.push(eq(profiles.status, status));
  if (q) {
    const pattern = `%${q}%`;
    filters.push(
      or(ilike(profiles.fullName, pattern), ilike(profiles.email, pattern))!,
    );
  }
  const whereExpr = filters.length === 1 ? filters[0] : and(...filters);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(profiles)
    .where(whereExpr);

  const rows = await db
    .select()
    .from(profiles)
    .where(whereExpr)
    .orderBy(desc(profiles.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/members?${qs}` : "/admin/members";
  }

  return (
    <AdminPage breadcrumbs={[{ label: "Members" }]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Members</h2>
        </div>
        <MemberFilters status={status} q={q} />
        <div className="rounded-lg border bg-card">
          {rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members match your filters"
              description={
                q || status
                  ? "Try clearing filters to see all members."
                  : "Once new members sign up and you approve them, they'll appear here."
              }
            />
          ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead className="w-24">Gym ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-40">Joined</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <MemberAvatar
                      size="sm"
                      fullName={m.fullName}
                      photoUrl={m.photoUrl}
                    />
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {m.gymId ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{m.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <StatusPill variant={m.status}>{m.status}</StatusPill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.createdAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={<Link href={`/admin/members/${m.id}`} />}
                      size="sm"
                      variant="ghost"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              render={<Link href={pageHref(Math.max(1, page - 1))} />}
              variant="outline"
              size="sm"
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              render={<Link href={pageHref(Math.min(totalPages, page + 1))} />}
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
