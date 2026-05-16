import { requireAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/admin/sidebar";

// This inline script runs before React hydrates. It reads the user's
// localStorage preference (defaulting to "dark") and applies the class
// to <html>. Prevents flash-of-unstyled-theme on cold load.
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

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <div className="min-h-screen flex bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </>
  );
}
