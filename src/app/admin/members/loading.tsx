import {
  AdminPageSkeleton,
  TableSkeleton,
  PageHeadingSkeleton,
} from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <AdminPageSkeleton breadcrumbs={[{ label: "Members" }]}>
      <div className="space-y-6">
        <PageHeadingSkeleton />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Skeleton className="h-9 w-full sm:w-40" />
          <Skeleton className="h-9 flex-1" />
        </div>
        <TableSkeleton columns={6} rows={6} />
      </div>
    </AdminPageSkeleton>
  );
}
