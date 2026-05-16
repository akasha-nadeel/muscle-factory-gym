import { cn } from "@/lib/utils";

export type StatusVariant =
  | "paid"
  | "succeeded"
  | "active"
  | "unpaid"
  | "failed"
  | "inactive"
  | "refunded"
  | "pending"
  | "expired"
  | "cancelled";

const variantClasses: Record<StatusVariant, string> = {
  paid: "bg-status-success-bg text-status-success",
  succeeded: "bg-status-success-bg text-status-success",
  active: "bg-status-success-bg text-status-success",
  unpaid: "bg-status-danger-bg text-status-danger",
  failed: "bg-status-danger-bg text-status-danger",
  inactive: "bg-status-danger-bg text-status-danger",
  refunded: "bg-status-muted-bg text-status-muted-fg",
  pending: "bg-status-warning-bg text-status-warning",
  expired: "bg-status-warning-bg text-status-warning",
  cancelled: "bg-status-muted-bg text-status-muted-fg",
};

export function StatusPill({
  variant,
  children,
  className,
}: {
  variant: StatusVariant;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        variantClasses[variant],
        className,
      )}
    >
      {children ?? variant}
    </span>
  );
}
