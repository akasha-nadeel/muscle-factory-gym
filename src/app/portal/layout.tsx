import Link from "next/link";
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
      <header className="border-b px-4 md:px-6 py-3 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <h1 className="font-semibold shrink-0">My Gym</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/portal" className="hover:underline">Home</Link>
            <Link href="/portal/profile" className="hover:underline">Profile</Link>
          </nav>
        </div>
        <UserButton />
      </header>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
