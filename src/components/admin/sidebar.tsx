import Image from "next/image";
import { NavItems } from "./nav-items";
import { getPendingMemberCount } from "@/lib/admin/pending-count";

export async function Sidebar() {
  const pendingCount = await getPendingMemberCount();
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
    </aside>
  );
}
