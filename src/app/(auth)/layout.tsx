import Link from "next/link";

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
          <Link href="/" className="text-center">
            <div className="text-xl font-semibold tracking-tight">
              Muscle Factory Gym
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Member portal
            </div>
          </Link>
          {children}
        </div>
      </main>
    </>
  );
}
