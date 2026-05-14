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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanForm } from "./_plan-form";
import { setPlanActive } from "./actions";
import { toast } from "sonner";

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

  function toggleActive(p: Plan) {
    startTransition(async () => {
      const r = await setPlanActive(p.id, !p.isActive);
      if (!r.ok) toast.error("Failed to update plan");
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>New plan</Button>
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
          {plans.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                No plans yet. Create one to get started.
              </TableCell>
            </TableRow>
          )}
          {plans.map((p) => (
            <TableRow key={p.id} className={p.isActive ? "" : "opacity-60"}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.durationDays} days</TableCell>
              <TableCell>{Number(p.priceLkr).toLocaleString()}</TableCell>
              <TableCell>
                {p.isActive ? (
                  <Badge>Active</Badge>
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
                  onClick={() => toggleActive(p)}
                >
                  {p.isActive ? "Disable" : "Re-enable"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </>
  );
}
