import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span
            key={i}
            className={
              "flex items-center gap-1.5 " +
              (isLast ? "min-w-0" : "shrink-0")
            }
          >
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  (isLast ? "text-foreground font-medium truncate" : "") +
                  " min-w-0"
                }
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="size-3.5 shrink-0" />}
          </span>
        );
      })}
    </nav>
  );
}
