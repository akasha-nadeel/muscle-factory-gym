import {
  AdminPageSkeleton,
  TableSkeleton,
  PageHeadingSkeleton,
} from "@/components/admin/skeletons";

export default function ReportsLoading() {
  return (
    <AdminPageSkeleton breadcrumbs={[{ label: "Reports" }]}>
      <div className="space-y-8">
        <PageHeadingSkeleton />
        <TableSkeleton columns={6} rows={6} />
      </div>
    </AdminPageSkeleton>
  );
}
