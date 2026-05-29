"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanForm } from "./_plan-form";
import { setPlanActive } from "./actions";
import { toast } from "sonner";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusPill } from "@/components/admin/status-pill";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/** "1 day" / "30 days" — small i18n touch that reads naturally in cards. */
function pluralDays(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

type Plan = {
  id: string;
  name: string;
  durationDays: number;
  priceLkr: string;
  isActive: boolean;
};

export function PlansTable({ plans }: { plans: Plan[] }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState<Plan | null>(null);

  function setActive(p: Plan, next: boolean) {
    startTransition(async () => {
      const r = await setPlanActive(p.id, next);
      if (!r.ok) toast.error("Failed to update plan");
      else if (!next) toast.success("Plan disabled");
      setConfirmDisable(null);
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setCreating(true)}
          className="bg-foreground/[0.80] hover:bg-foreground/[0.90] text-background hover:text-background dark:bg-white dark:hover:bg-white/90 dark:text-black dark:hover:text-black"
        >
          New plan
        </Button>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create plan</DialogTitle>
            </DialogHeader>
            <PlanForm
              mode="create"
              onDone={() => {
                setCreating(false);
                toast.success("Plan created");
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Tag}
            title="No plans yet"
            description="Create your first membership plan to get started."
            action={{ label: "New plan", onClick: () => setCreating(true) }}
          />
        </div>
      ) : (
        <>
          {/* Mobile — card layout. Each plan gets clear hierarchy:
              name + status header, large price as the eye-anchor, duration
              as muted metadata, then a full-width action row so the buttons
              don't overflow off-screen (the bug the desktop table had on
              narrow viewports). */}
          <div className="sm:hidden space-y-3">
            {plans.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "rounded-xl border bg-card p-4 space-y-3 transition-opacity",
                  p.isActive ? "" : "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-base truncate">
                    {p.name}
                  </div>
                  {p.isActive ? (
                    <StatusPill variant="active">Active</StatusPill>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </div>

                <div>
                  <div className="text-2xl font-semibold tabular-nums">
                    LKR {Number(p.priceLkr).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {pluralDays(p.durationDays)}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(p)}
                    className="flex-1 bg-foreground hover:bg-foreground/90 text-background hover:text-background border-transparent dark:bg-white dark:hover:bg-white/90 dark:text-black dark:hover:text-black"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      p.isActive ? setConfirmDisable(p) : setActive(p, true)
                    }
                    className={cn(
                      "flex-1",
                      p.isActive
                        ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        : "text-emerald-600 border-emerald-600/30 hover:bg-emerald-600/10 hover:text-emerald-600 dark:text-emerald-500 dark:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-500",
                    )}
                  >
                    {p.isActive ? "Disable" : "Re-enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Tablet / desktop — keep the existing table. Hidden below sm so
              the mobile cards above own that viewport range. */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Duration</TableHead>
                  <TableHead className="w-32">Price (LKR)</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-48 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow
                    key={p.id}
                    className={p.isActive ? "" : "opacity-60"}
                  >
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{pluralDays(p.durationDays)}</TableCell>
                    <TableCell>
                      {Number(p.priceLkr).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {p.isActive ? (
                        <StatusPill variant="active">Active</StatusPill>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Fixed widths on each button so Edit + action line up as
                          clean vertical columns across rows, regardless of the
                          Disable / Re-enable label width difference. */}
                      <div className="inline-flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(p)}
                          className="w-16 bg-foreground hover:bg-foreground/90 text-background hover:text-background border-transparent dark:bg-white dark:hover:bg-white/90 dark:text-black dark:hover:text-black"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            p.isActive
                              ? setConfirmDisable(p)
                              : setActive(p, true)
                          }
                          className={cn(
                            "w-24",
                            p.isActive
                              ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                              : "text-emerald-600 border-emerald-600/30 hover:bg-emerald-600/10 hover:text-emerald-600 dark:text-emerald-500 dark:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-500",
                          )}
                        >
                          {p.isActive ? "Disable" : "Re-enable"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit plan</DialogTitle>
          </DialogHeader>
          {editing && (
            <PlanForm
              mode="edit"
              planId={editing.id}
              initial={{
                name: editing.name,
                durationDays: String(editing.durationDays),
                priceLkr: editing.priceLkr,
              }}
              onDone={() => {
                setEditing(null);
                toast.success("Plan updated");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDisable !== null}
        onOpenChange={(o) => !o && setConfirmDisable(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable this plan?</DialogTitle>
            <DialogDescription>
              {confirmDisable && (
                <>
                  &quot;{confirmDisable.name}&quot; will no longer appear when
                  approving new members or recording payments. Existing
                  memberships on this plan stay active. You can re-enable
                  anytime.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDisable(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() =>
                confirmDisable && setActive(confirmDisable, false)
              }
            >
              {isPending ? "Disabling…" : "Disable plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
