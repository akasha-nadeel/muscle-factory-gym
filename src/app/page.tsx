import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const u = await getCurrentUser();
  if (u) {
    redirect(u.role === "admin" ? "/admin" : "/portal");
  }
  return (
    <main className="min-h-screen flex flex-col gap-4 items-center justify-center">
      <h1 className="text-3xl font-semibold">Gym Management</h1>
      <div className="flex gap-3">
        <Link href="/sign-in" className={buttonVariants({})}>
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className={buttonVariants({ variant: "outline" })}
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
