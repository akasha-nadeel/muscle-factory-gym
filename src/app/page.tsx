import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  let planList: { id: string; name: string; durationDays: number; priceLkr: string }[] = [];
  try {
    planList = await db
      .select({
        id: plans.id,
        name: plans.name,
        durationDays: plans.durationDays,
        priceLkr: plans.priceLkr,
      })
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(asc(plans.durationDays));
  } catch (err) {
    console.warn(`[landing] plans query failed: ${err}`);
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
              className="h-auto w-auto max-h-9 invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0"
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
        <section className="max-w-6xl mx-auto px-4 md:px-6 py-20 md:py-28 text-center">
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

        {/* Plans */}
        {planList.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 border-t">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-semibold">
                Membership plans
              </h2>
              <p className="text-muted-foreground mt-2">
                Pick the plan that fits your routine.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {planList.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-3xl font-semibold tabular-nums">
                      LKR {Number(p.priceLkr).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.durationDays}-day access
                    </div>
                    <Link
                      href="/sign-up"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "w-full mt-3",
                      })}
                    >
                      Join
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

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
