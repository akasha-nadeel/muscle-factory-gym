import Image from "next/image";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { UserButton } from "@clerk/nextjs";

// The member portal is ALWAYS dark — it has no theme toggle and a single
// consistent dark look is the intended design. Force the `dark` class
// regardless of any localStorage `theme` value (which can be left as
// 'light' from the admin UI's toggle in a shared browser, which was
// flipping the portal to light). Runs before hydration → no flash.
const themeInitScript = `
(function() {
  document.documentElement.classList.add('dark');
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
        <header className="h-14 flex items-center justify-between px-5 sm:px-6 md:px-8">
          {/* Brand logo, top-left. Portal is always dark, so the logo's
              white+red rendering is correct with no light-mode filter. */}
          <Link href="/portal" aria-label="Muscle Factory Gym home">
            <Image
              src="/logo.webp"
              alt="Muscle Factory Gym"
              width={180}
              height={42}
              priority
              className="h-7 sm:h-[34px] w-auto"
            />
          </Link>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "!size-11 sm:!size-8",
                avatarBox: "!size-11 sm:!size-8",
              },
            }}
          />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
