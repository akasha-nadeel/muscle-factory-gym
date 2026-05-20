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
          onClick={() => setCreating(true)}
          className="dark:bg-white dark:text-black dark:hover:bg-white/90"
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
            <TableRow key={p.id} className={p.isActive ? "" : "opacity-60"}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.durationDays} days</TableCell>
              <TableCell>{Number(p.priceLkr).toLocaleString()}</TableCell>
              <TableCell>
                {p.isActive ? (
                  <StatusPill variant="active">Active</StatusPill>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(p)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    p.isActive ? setConfirmDisable(p) : setActive(p, true)
                  }
                >
                  {p.isActive ? "Disable" : "Re-enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
