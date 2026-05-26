import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { displayName } from "@/lib/profiles/display-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./status-pill";
import { MemberAvatar } from "./member-avatar";
import { EmptyState } from "./empty-state";
import { Wallet } from "lucide-react";

export type RecentPayment = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhotoUrl: string | null;
  amountLkr: string;
  method: "cash" | "bank_transfer" | "payhere";
  status: "pending" | "succeeded" | "failed" | "refunded";
  paidAt: Date;
};

export function RecentPaymentsPanel({
  rows,
  headerSlot,
}: {
  rows: RecentPayment[];
  headerSlot?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
        <CardTitle className="text-base shrink-0">Recent payments</CardTitle>
        <div className="flex items-center gap-2 ml-auto">
          {headerSlot}
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/reports" />}
          >
            View all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" />
        ) : (
          <ul className="divide-y">
            {rows.map((p) => {
              const amount = Number(p.amountLkr);
              return (
                <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                  <MemberAvatar
                    size="sm"
                    fullName={p.memberName}
                    photoUrl={p.memberPhotoUrl}
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/members/${p.memberId}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {displayName(p.memberName)}
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
