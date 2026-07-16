import Image from "next/image";
import Link from "next/link";
import { requireMember, getCurrentProfile } from "@/lib/auth";
import { currentUser } from "@clerk/nextjs/server";
import { AccountPill } from "@/components/account-pill";
import { displayName } from "@/lib/profiles/display-name";
import { normalizeAvatarUrl } from "@/lib/profiles/photo";

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
          {/* Identity pill — name + Gym ID subtitle with the account avatar
              (and its menu) on the right. Shared with the admin top bar. */}
          <AccountPill
            name={name}
            subtitle={handle}
            email={email}
            imageUrl={avatarUrl}
          />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full p-4 md:p-6">{children}</div>
        </main>
    </div>
  );
}
