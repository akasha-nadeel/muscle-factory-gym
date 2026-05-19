import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionLink = { label: string; href: string; onClick?: never };
type ActionButton = { label: string; href?: never; onClick: () => void };

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ActionLink | ActionButton;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        className,
      )}
    >
      <div className="size-12 rounded-full bg-muted/40 flex items-center justify-center mb-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <div className="text-xs text-muted-foreground mt-1 max-w-xs">
          {description}
        </div>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Button size="sm" render={<Link href={action.href} />}>
              {action.label}
            </Button>
          ) : (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
