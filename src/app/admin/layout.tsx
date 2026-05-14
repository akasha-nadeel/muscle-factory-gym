import { requireAdmin } from "@/lib/auth";
import { UserButton } from "@clerk/nextjs";
import { AdminNav } from "./_nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center">
        <h1 className="font-semibold">Gym Admin</h1>
        <UserButton />
      </header>
      <div className="flex-1 flex">
        <AdminNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
