import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
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
