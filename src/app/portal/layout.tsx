import Link from "next/link";
import Image from "next/image";
import { requireMember } from "@/lib/auth";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import { PortalNav } from "@/components/portal/nav";

// Same inline theme-init script as admin/auth/landing — apply dark by default
// unless localStorage says otherwise. Runs before React hydrates so there's
// no flash of light theme on cold load.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'light') document.documentElement.classList.add('dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMember();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-20 h-14 border-b bg-card flex items-center justify-between px-3 sm:px-4 md:px-6 gap-2 sm:gap-4">
          <Link
            href="/portal"
            className="shrink-0 flex items-center"
            aria-label="Muscle Factory Gym — Home"
          >
            <Image
              src="/logo.png"
              alt="Muscle Factory Gym"
              width={180}
              height={42}
              priority
              className="h-7 sm:h-9 w-auto"
            />
          </Link>
          <PortalNav />
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
