import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Link href="/" className="text-center flex flex-col items-center">
          <Image
            src="/logo.webp"
            alt="Muscle Factory Gym"
            width={280}
            height={64}
            priority
            className="h-auto w-auto max-w-[280px]"
          />
          <div className="text-xs text-muted-foreground mt-1.5">
            Member portal
          </div>
        </Link>
        {children}
      </div>
    </main>
  );
}
