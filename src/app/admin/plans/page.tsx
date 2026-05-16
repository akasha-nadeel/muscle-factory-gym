import { db } from "@/db";
import { plans } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { PlansTable } from "./_plans-table";
import { AdminPage } from "@/components/admin/admin-page";

export default async function PlansPage() {
  await requireAdminProfile();
  const rows = await db.select().from(plans).orderBy(desc(plans.createdAt));
  return (
    <AdminPage breadcrumbs={[{ label: "Plans" }]}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Plans</h2>
        </div>
        <PlansTable plans={rows} />
      </div>
    </AdminPage>
  );
}
