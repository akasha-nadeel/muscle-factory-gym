"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberAvatar } from "./member-avatar";
import { EmptyState } from "./empty-state";
import { RangeToggle, type RangeKey, type RangeStarts } from "./range-toggle";
import { Activity } from "lucide-react";
import { displayName } from "@/lib/profiles/display-name";

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

const MAX_VISIBLE = 10;

export function RecentCheckinsPanel({
  rows,
  rangeStarts,
}: {
  /** Rows for the WIDEST range, most-recent first. Filtered client-side. */
  rows: RecentCheckin[];
  rangeStarts: RangeStarts;
}) {
  const [range, setRange] = useState<RangeKey>("today");
  const visible = useMemo(() => {
    const start = rangeStarts[range];
    return rows
      .filter((c) => new Date(c.checkedInAt).getTime() >= start)
      .slice(0, MAX_VISIBLE);
  }, [rows, rangeStarts, range]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
        <CardTitle className="text-base shrink-0">Recent check-ins</CardTitle>
        <div className="flex items-center gap-2 ml-auto">
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <EmptyState icon={Activity} title="No check-ins yet" />
        ) : (
          <ul className="divide-y">
            {visible.map((c) => (
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
                    {displayName(c.memberName)}
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
