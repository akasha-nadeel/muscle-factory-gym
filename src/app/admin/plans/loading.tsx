import {
  AdminPageSkeleton,
  TableSkeleton,
  PageHeadingSkeleton,
} from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <AdminPageSkeleton breadcrumbs={[{ label: "Plans" }]}>
      <div className="space-y-6">
        <PageHeadingSkeleton />
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28" />
        </div>
        <TableSkeleton columns={5} rows={4} />
      </div>
    </AdminPageSkeleton>
  );
}
