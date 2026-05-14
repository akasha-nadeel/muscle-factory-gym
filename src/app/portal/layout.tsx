import { requireMember } from "@/lib/auth";
import { UserButton } from "@clerk/nextjs";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMember();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center">
        <h1 className="font-semibold">My Gym</h1>
        <UserButton />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
