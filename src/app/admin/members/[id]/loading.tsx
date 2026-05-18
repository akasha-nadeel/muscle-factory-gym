import {
  AdminPageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MemberDetailLoading() {
  return (
    <AdminPageSkeleton
      breadcrumbs={[
        { label: "Members", href: "/admin/members" },
        { label: "…" },
      ]}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-32" />
        </div>
        <StatCardsSkeleton />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <TableSkeleton columns={6} rows={3} />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <TableSkeleton columns={2} rows={3} />
        </div>
      </div>
    </AdminPageSkeleton>
  );
}
