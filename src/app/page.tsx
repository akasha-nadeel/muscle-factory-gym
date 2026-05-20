import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";

// Same theme-init script as admin/auth — apply dark by default.
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
      <main className="min-h-screen bg-background text-foreground">
        {/* Top bar */}
        <header className="border-b">
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
            <Image
              src="/logo.png"
              alt="Muscle Factory Gym"
              width={180}
              height={41}
              priority
              className="h-auto w-auto max-h-7 sm:max-h-9 [filter:url(#logo-light-mode)_brightness(2)_saturate(1.5)] dark:[filter:none]"
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
        <section className="max-w-6xl mx-auto px-4 md:px-6 pt-12 md:pt-16 pb-20 md:pb-28 text-center">
          <Image
            src="/hero-logo.png"
            alt="Muscle Factory Gym"
            width={822}
            height={760}
            priority
            className="mx-auto h-auto w-full max-w-[280px] md:max-w-[360px] mb-6 md:mb-8 [filter:url(#logo-light-mode)_brightness(2)_saturate(1.5)] dark:[filter:none]"
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

        {/* Footer */}
        <footer className="border-t mt-16">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-2">
            <div>© Muscle Factory Gym</div>
            <div className="flex gap-4">
              <Link href="/sign-in" className="hover:text-foreground">
                Sign in
              </Link>
              <Link href="/sign-up" className="hover:text-foreground">
                Sign up
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
