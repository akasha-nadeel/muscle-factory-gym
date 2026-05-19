import Link from "next/link";
import Image from "next/image";

// Same theme-init script as admin layout — apply dark by default unless
// localStorage says otherwise.
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

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 py-12">
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <Link href="/" className="text-center flex flex-col items-center">
            <Image
              src="/logo.png"
              alt="Muscle Factory Gym"
              width={280}
              height={64}
              priority
              className="h-auto w-auto max-w-[280px] [filter:url(#logo-light-mode)_brightness(2)_saturate(1.5)] dark:[filter:none]"
            />
            <div className="text-xs text-muted-foreground mt-1.5">
              Member portal
            </div>
          </Link>
          {children}
        </div>
      </main>
    </>
  );
}
