import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "./member-avatar";
import { EmptyState } from "./empty-state";
import { Activity } from "lucide-react";

export type RecentCheckin = {
  id: string;
  memberId: string;
  memberName: string;
  memberPhotoUrl: string | null;
  gymId: number | null;
  checkedInAt: Date;
  source: "qr_scan" | "manual" | "kiosk_id";
};

const sourceLabel: Record<RecentCheckin["source"], string> = {
  qr_scan: "QR scan",
  manual: "Manual",
  kiosk_id: "Kiosk",
};

export function RecentCheckinsPanel({ rows }: { rows: RecentCheckin[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent check-ins</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState icon={Activity} title="No check-ins yet" />
        ) : (
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                <MemberAvatar
                  size="sm"
                  fullName={c.memberName}
                  photoUrl={c.memberPhotoUrl}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/admin/members/${c.memberId}`}
                    className="font-medium text-sm hover:underline truncate block"
                  >
                    {c.memberName}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.gymId !== null && (
                      <span className="font-mono mr-2">#{c.gymId}</span>
                    )}
                    {sourceLabel[c.source]} ·{" "}
                    {formatDistanceToNow(c.checkedInAt, { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
