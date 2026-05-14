"use client";

import { useState, useActionState, useEffect } from "react";
import { approveMember, type ApproveResult } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type PlanOption = { id: string; name: string; durationDays: number; priceLkr: string };

export function ApproveButton({
  memberId,
  memberName,
  plans,
}: {
  memberId: string;
  memberName: string;
  plans: PlanOption[];
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [state, dispatch, pending] = useActionState<ApproveResult | undefined, FormData>(
    approveMember,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Approved ${memberName}`);
      setOpen(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, memberName]);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Approve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {memberName}</DialogTitle>
            <DialogDescription>
              Pick the plan this member is starting on. Their membership will begin today.
              No payment is recorded in this step — record it from the member's detail page after Phase 2 ships.
            </DialogDescription>
          </DialogHeader>
          <form action={dispatch} className="space-y-4">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="planId" value={planId} />
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.durationDays}d — LKR {Number(p.priceLkr).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={pending || !planId}>
                {pending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
