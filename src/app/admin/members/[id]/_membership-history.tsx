"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin/status-pill";
import { EmptyState } from "@/components/admin/empty-state";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { CancelMembershipButton } from "./_cancel-membership-button";

const INITIAL_VISIBLE = 5;

export type MembershipHistoryRow = {
  id: string;
  status: "active" | "expired" | "cancelled";
  startDate: string;
  endDate: string;
  planName: string;
  planPriceLkr: string;
};

export function MembershipHistory({
  history,
  memberId,
  wiped,
}: {
  history: MembershipHistoryRow[];
  memberId: string;
  wiped: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState icon={Calendar} title="No memberships yet" />
      </div>
    );
  }

  const visible =
    expanded || history.length <= INITIAL_VISIBLE
      ? history
      : history.slice(0, INITIAL_VISIBLE);
  const hasMore = history.length > INITIAL_VISIBLE;

  const toggleButton = hasMore ? (
    <div className="flex justify-center pt-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((e) => !e)}
        className="text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <>
            <ChevronUp className="size-4" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="size-4" />
            Show all {history.length} memberships
          </>
        )}
      </Button>
    </div>
  ) : null;

  return (
    <>
      {/* Mobile: cards. Capped at 5 initially. */}
      <div className="sm:hidden space-y-2">
        {visible.map((h) => (
          <div
            key={h.id}
            className="rounded-xl border bg-card p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium truncate">{h.planName}</div>
              <StatusPill variant={h.status}>{h.status}</StatusPill>
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(h.startDate), "MMM d, yyyy")}
              {" – "}
              {format(new Date(h.endDate), "MMM d, yyyy")}
            </div>
            {h.status === "active" && !wiped && (
              <div className="flex justify-end pt-1">
                <CancelMembershipButton
                  memberId={memberId}
                  membershipId={h.id}
                />
              </div>
            )}
          </div>
        ))}
        {toggleButton}
      </div>

      {/* Tablet / desktop: table. Show-more button sits below the table. */}
      <div className="hidden sm:block">
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.planName}</TableCell>
                  <TableCell>
                    {format(new Date(h.startDate), "PP")}
                  </TableCell>
                  <TableCell>
                    {format(new Date(h.endDate), "PP")}
                  </TableCell>
                  <TableCell>
                    <StatusPill variant={h.status}>{h.status}</StatusPill>
                  </TableCell>
                  <TableCell className="text-right">
                    {h.status === "active" && !wiped ? (
                      <CancelMembershipButton
                        memberId={memberId}
                        membershipId={h.id}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {toggleButton}
      </div>
    </>
  );
}
