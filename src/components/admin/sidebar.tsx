import Image from "next/image";
import { NavItems } from "./nav-items";
import { StorageMeter } from "./storage-meter";
import { getPendingMemberCount } from "@/lib/admin/pending-count";
import { getDatabaseUsage } from "@/lib/admin/get-db-usage";

export async function Sidebar() {
  // A transient DB error on the usage query must not take down the whole
  // admin shell — degrade to hiding the meter instead.
  const [pendingCount, usage] = await Promise.all([
    getPendingMemberCount(),
    getDatabaseUsage().catch(() => null),
  ]);
  return (
    <aside className="dark hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="h-14 px-4 border-b border-sidebar-border flex items-center justify-center">
        <Image
          src="/logo.webp"
          alt="Muscle Factory Gym"
          width={180}
          height={42}
          priority
          className="h-[34px] w-auto"
        />
      </div>
      <NavItems pendingCount={pendingCount} />
      {usage && <StorageMeter {...usage} />}
    </aside>
  );
}
