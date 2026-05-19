import Image from "next/image";
import { NavItems } from "./nav-items";

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="h-14 px-4 border-b border-sidebar-border flex items-center justify-center">
        <Image
          src="/logo.png"
          alt="Muscle Factory Gym"
          width={180}
          height={42}
          priority
          className="h-9 w-auto invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0"
        />
      </div>
      <NavItems />
    </aside>
  );
}
