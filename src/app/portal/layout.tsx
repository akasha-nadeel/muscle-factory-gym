import { requireMember } from "@/lib/auth";
import { UserButton } from "@clerk/nextjs";

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
        <header className="h-14 flex items-center justify-end px-5 sm:px-6 md:px-8">
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
