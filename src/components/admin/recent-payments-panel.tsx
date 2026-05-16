import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./status-pill";

export type RecentPayment = {
  id: string;
  memberId: string;
  memberName: string;
  amountLkr: string;
  method: "cash" | "bank_transfer" | "payhere";
  status: "pending" | "succeeded" | "failed" | "refunded";
  paidAt: Date;
};

export function RecentPaymentsPanel({ rows }: { rows: RecentPayment[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Recent payments</CardTitle>
        <Button variant="ghost" size="sm" render={<Link href="/admin/reports" />}>
          View all
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground text-center">
            No payments yet.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((p) => {
              const amount = Number(p.amountLkr);
              return (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/members/${p.memberId}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {p.memberName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.method.replace("_", " ")} ·{" "}
                      {formatDistanceToNow(p.paidAt, { addSuffix: true })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium tabular-nums text-sm">
                      {amount < 0 ? "-" : ""}LKR{" "}
                      {Math.abs(amount).toLocaleString()}
                    </div>
                    <StatusPill variant={p.status} className="mt-1">
                      {p.status}
                    </StatusPill>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
