import { TopBar } from "./top-bar";
import type { BreadcrumbItem } from "./breadcrumbs";

/**
 * Per-page wrapper. Each admin page renders <AdminPage breadcrumbs={[...]}>
 * around its content; the layout supplies the sidebar shell.
 */
export function AdminPage({
  breadcrumbs,
  children,
}: {
  breadcrumbs: BreadcrumbItem[];
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar breadcrumbs={breadcrumbs} />
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
    </>
  );
}
