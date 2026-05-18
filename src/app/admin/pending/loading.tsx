import {
  AdminPageSkeleton,
  TableSkeleton,
  PageHeadingSkeleton,
} from "@/components/admin/skeletons";

export default function PendingLoading() {
  return (
    <AdminPageSkeleton breadcrumbs={[{ label: "Pending" }]}>
      <div className="space-y-6">
        <PageHeadingSkeleton />
        <TableSkeleton columns={4} rows={4} />
      </div>
    </AdminPageSkeleton>
  );
}
