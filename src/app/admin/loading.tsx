import {
  AdminPageSkeleton,
  StatCardsSkeleton,
  PageHeadingSkeleton,
} from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <AdminPageSkeleton breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <PageHeadingSkeleton />
        <StatCardsSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminPageSkeleton>
  );
}
