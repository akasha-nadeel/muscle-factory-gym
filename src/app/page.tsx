import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { ForceDarkOnMount } from "./_force-dark";

// Landing page is locked to dark theme — ignore any saved 'light' preference
// from /portal so the marketing surface stays visually consistent.
const themeInitScript = `
document.documentElement.classList.add('dark');
`;

export default async function Home() {
  const u = await getCurrentUser();
  if (u) {
    redirect(u.role === "admin" ? "/admin" : "/portal");
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <ForceDarkOnMount />
      <main className="min-h-screen bg-background text-foreground">
        {/* Top bar */}
        <header>
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
            <Image
              src="/logo.webp"
              alt="Muscle Factory Gym"
              width={180}
              height={41}
              priority
              className="h-auto w-auto max-h-7 sm:max-h-9"
            />
            <div className="flex items-center gap-2">
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "sm" })}
              >
                Join now
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 md:px-6 pt-10 md:pt-4 pb-16 md:pb-20 text-center">
          <Image
            src="/hero-logo.webp"
            alt="Muscle Factory Gym"
            width={822}
            height={760}
            priority
            className="mx-auto h-auto w-full max-w-[240px] md:max-w-[340px] mb-4 md:mb-6"
          />
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight">
            Train hard.{" "}
            <span className="text-primary">Track everything.</span>
          </h1>
          <p className="text-muted-foreground text-lg mt-6 max-w-xl mx-auto">
            Membership management, attendance tracking, and online payments
            for our gym &mdash; all in one portal.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <Link
              href="/sign-up"
              className={buttonVariants({ size: "lg" })}
            >
              Become a member
            </Link>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Member sign in
            </Link>
          </div>
        </section>

        {/* Footer — single-line, centered on all screen sizes. */}
        <footer className="border-t mt-12 sm:mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6 text-xs sm:text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} Muscle Factory Gym. All rights
            reserved.
          </div>
        </footer>
      </main>
    </>
  );
}
