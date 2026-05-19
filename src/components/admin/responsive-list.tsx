import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ResponsiveListColumn<T> = {
  key: string;
  header: React.ReactNode;
  /** Cell renderer for the desktop table row. */
  cell: (row: T) => React.ReactNode;
  /** Optional Tailwind class for the <TableHead> (width, alignment, etc.). */
  headClassName?: string;
};

/**
 * Renders a shadcn <Table> on `sm+` and a stacked card list on `<sm`. Lets each
 * call site control mobile layout independently from the table columns —
 * because a faithful "row as card" rarely is the right UX on a phone.
 *
 * Use the `empty` slot to render the same EmptyState in both layouts.
 */
export function ResponsiveList<T>({
  rows,
  columns,
  renderCard,
  rowKey,
  empty,
  className,
  desktopWrapperClassName = "rounded-lg border bg-card",
  mobileWrapperClassName = "rounded-lg border bg-card divide-y",
}: {
  rows: T[];
  columns: ResponsiveListColumn<T>[];
  renderCard: (row: T) => React.ReactNode;
  rowKey: (row: T) => string;
  empty: React.ReactNode;
  className?: string;
  desktopWrapperClassName?: string;
  mobileWrapperClassName?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className={cn(desktopWrapperClassName, className)}>{empty}</div>
    );
  }
  return (
    <div className={className}>
      {/* Desktop: shadcn table */}
      <div className={cn("hidden sm:block", desktopWrapperClassName)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.headClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="p-2 align-middle whitespace-nowrap"
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards */}
      <div className={cn("sm:hidden", mobileWrapperClassName)}>
        {rows.map((row) => (
          <div key={rowKey(row)} className="p-3">
            {renderCard(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
