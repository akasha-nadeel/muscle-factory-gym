import Link from "next/link";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { and, eq, ilike, or, count, asc, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
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
import { NavPendingProvider, ListArea } from "./_nav-pending";
import { AdminPage } from "@/components/admin/admin-page";
import { StatusPill } from "@/components/admin/status-pill";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { EmptyState } from "@/components/admin/empty-state";
import { SortHeader } from "@/components/admin/sort-header";
import { Users, ChevronRight } from "lucide-react";
import {
  parseSortParams,
  nextSortFor,
  type ParsedSort,
} from "@/lib/sort-params";
import { notWipedClause } from "@/lib/profiles/wiped";
import { displayName } from "@/lib/profiles/display-name";

const PAGE_SIZE = 25;
const SORT_FIELDS = ["gymId", "fullName", "status", "createdAt"] as const;
type SortField = (typeof SORT_FIELDS)[number];

type SearchParams = {
  status?: string;
  q?: string;
  page?: string;
  sort?: string;
  dir?: string;
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
  const sort: ParsedSort<SortField> = parseSortParams(
    sp,
    SORT_FIELDS,
    { field: "createdAt", dir: "desc" },
  );

  const filters = [eq(profiles.role, "member")];
  filters.push(notWipedClause);
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

  const orderColumn = {
    gymId: profiles.gymId,
    fullName: profiles.fullName,
    status: profiles.status,
    createdAt: profiles.createdAt,
  }[sort.field];
  const orderBy: SQL = sort.dir === "asc" ? asc(orderColumn) : desc(orderColumn);

  const rows = await db
    .select()
    .from(profiles)
    .where(whereExpr)
    .orderBy(orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: {
    page?: number;
    sort?: SortField;
    dir?: "asc" | "desc";
  }) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const nextPage = overrides.page ?? page;
    if (nextPage > 1) params.set("page", String(nextPage));
    const nextField = overrides.sort ?? sort.field;
    const nextDir = overrides.dir ?? sort.dir;
    if (!(nextField === "createdAt" && nextDir === "desc")) {
      params.set("sort", nextField);
      params.set("dir", nextDir);
    }
    const qs = params.toString();
    return qs ? `/admin/members?${qs}` : "/admin/members";
  }

  function sortHrefFor(field: SortField): string {
    const next = nextSortFor(sort, field);
    return buildHref({ page: 1, sort: next.field, dir: next.dir });
  }

  function pageHref(p: number) {
    return buildHref({ page: p });
  }

  return (
    <AdminPage breadcrumbs={[{ label: "Members" }]}>
      <NavPendingProvider>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Members</h2>
        </div>
        <MemberFilters status={status} q={q} />
        <ListArea>
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={Users}
              title="No members match your filters"
              description={
                q || status
                  ? "Try clearing filters to see all members."
                  : "Once new members sign up and you approve them, they'll appear here."
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile: discrete tappable cards (<sm).
                Senior pattern: row layout with name+meta on the left,
                status pill on the RIGHT (separated from name to reduce
                visual competition), and a ChevronRight to signal tap
                affordance — the iOS Settings + Stripe Customers pattern.
                Each card is its own surface (bg-card + border) with
                active:bg-accent for clear touch feedback. */}
            <ul className="sm:hidden space-y-2">
              {rows.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/admin/members/${m.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:bg-accent active:bg-accent/80 transition-colors"
                  >
                    <MemberAvatar
                      size="md"
                      fullName={m.fullName}
                      photoUrl={m.photoUrl}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {displayName(m.fullName)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 min-w-0">
                        {m.gymId !== null && (
                          <span className="font-mono tabular-nums shrink-0">
                            #{m.gymId}
                          </span>
                        )}
                        <span className="truncate">{m.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <StatusPill variant={m.status}>{m.status}</StatusPill>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop: table (sm+) — wrapped in card surface to match the
                rest of the admin shell. */}
            <div className="hidden sm:block rounded-lg border bg-card">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <SortHeader
                  field="gymId"
                  label="Gym ID"
                  current={sort}
                  hrefFor={sortHrefFor}
                  className="w-24"
                />
                <SortHeader
                  field="fullName"
                  label="Name"
                  current={sort}
                  hrefFor={sortHrefFor}
                />
                <TableHead>Email</TableHead>
                <SortHeader
                  field="status"
                  label="Status"
                  current={sort}
                  hrefFor={sortHrefFor}
                  className="w-32"
                />
                <SortHeader
                  field="createdAt"
                  label="Joined"
                  current={sort}
                  hrefFor={sortHrefFor}
                  className="w-40"
                />
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
                  <TableCell className="font-medium">{displayName(m.fullName)}</TableCell>
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
                      variant="outline"
                      className="bg-foreground hover:bg-foreground/90 text-background hover:text-background border-transparent dark:bg-white dark:hover:bg-white/90 dark:text-black dark:hover:text-black"
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            </div>
          </>
        )}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm text-muted-foreground">
            <span>
              {totalPages > 1
                ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
                : `${total} ${total === 1 ? "member" : "members"}`}
            </span>
            {/* Pagination only renders when there's more than one page —
                disabled Previous/Next buttons on a single-page list are
                noise. */}
            {totalPages > 1 && (
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
                  render={
                    <Link href={pageHref(Math.min(totalPages, page + 1))} />
                  }
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
        </ListArea>
      </div>
      </NavPendingProvider>
    </AdminPage>
  );
}
