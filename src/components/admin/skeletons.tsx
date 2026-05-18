import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "./top-bar";
import type { BreadcrumbItem } from "./breadcrumbs";

export function AdminPageSkeleton({
  breadcrumbs,
  children,
}: {
  breadcrumbs: BreadcrumbItem[];
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar breadcrumbs={breadcrumbs} />
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
    </>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  columns = 4,
  rows = 6,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b flex gap-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-3 py-3 flex gap-3 items-center">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}
