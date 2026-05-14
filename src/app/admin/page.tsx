import { requireAdminProfile } from "@/lib/auth";

export default async function AdminHome() {
  const admin = await requireAdminProfile();
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
      <p className="text-muted-foreground">
        Use the sidebar to manage members, approvals, and plans.
      </p>
    </div>
  );
}
