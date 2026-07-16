import Image from "next/image";
import Link from "next/link";
import { requireMember, getCurrentProfile } from "@/lib/auth";
import { currentUser } from "@clerk/nextjs/server";
import { PortalAccountMenu } from "@/components/portal/account-menu";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";

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
  // Resolve the header identity the SAME way the portal hero does, so the
  // header avatar + name never diverge from the big hero avatar + name:
  //  - name: live Clerk name → else the email's local-part (via
  //    displayName) → else "Member". Matches the hero's fallback chain.
  //  - image: only a REAL photo (uploaded/OAuth) passes normalizeAvatarUrl;
  //    Clerk's generic placeholder is dropped to null so the menu renders
  //    our colored-initials fallback instead.
  // Non-fatal — falls back gracefully if Clerk is briefly unreachable.
  const clerkUser = await currentUser().catch(() => null);
  const clerkFullName =
    [clerkUser?.firstName, clerkUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || null;
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const name = displayName(clerkFullName ?? email);
  const avatarUrl = normalizeAvatarUrl(clerkUser?.imageUrl);
  // Subtitle under the name in the header pill — the member's Gym ID as a
  // handle (e.g. "#1000"), falling back to "Member" before one is assigned
  // (pending accounts). Cheap read, no redirect.
  const profile = await getCurrentProfile();
  const handle =
    profile?.gymId != null ? `#${profile.gymId}` : "Member";
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
              className="h-5 sm:h-[34px] w-auto"
            />
          </Link>
          {/* Identity pill (reference layout): avatar on the left, then the
              name with a subtitle (Gym ID) stacked to the right. Text
              truncates so the pill stays compact next to the logo on
              mobile. Only the avatar is interactive — it opens the menu. */}
          <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-border/60 bg-card py-0.5 pl-2.5 pr-0.5 sm:pl-3 sm:pr-1 shadow-sm">
            <div className="flex min-w-0 flex-col items-end leading-tight text-right">
              <span className="truncate text-[0.72rem] sm:text-[0.8rem] font-medium text-foreground max-w-[92px] sm:max-w-[160px]">
                {name}
              </span>
              <span className="truncate text-[0.62rem] sm:text-[0.7rem] text-muted-foreground max-w-[92px] sm:max-w-[160px]">
                {handle}
              </span>
            </div>
            <PortalAccountMenu name={name} email={email} imageUrl={avatarUrl} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
