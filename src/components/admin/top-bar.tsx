import { UserButton } from "@clerk/nextjs";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { MemberSearch } from "./member-search";
import { MobileNav } from "./mobile-nav";

export function TopBar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  return (
    <header className="sticky top-0 z-20 h-14 border-b bg-card flex items-center px-3 md:px-6 gap-2 md:gap-4">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:block">
          <MemberSearch />
        </div>
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
