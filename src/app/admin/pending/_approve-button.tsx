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
import { Input } from "@/components/ui/input";
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
  const [includeAdmission, setIncludeAdmission] = useState(false);
  const [includeFirstPayment, setIncludeFirstPayment] = useState(false);
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

  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-emerald-500 hover:bg-emerald-600 text-white"
      >
        Approve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve {memberName}</DialogTitle>
            <DialogDescription>
              Pick a plan. Optionally record the admission fee and/or the first month&apos;s
              payment in the same step — both will be saved atomically with the membership.
            </DialogDescription>
          </DialogHeader>
          <form action={dispatch} className="space-y-4">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="planId" value={planId} />

            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue>
                    {selectedPlan
                      ? `${selectedPlan.name} — ${selectedPlan.durationDays}d — LKR ${Number(selectedPlan.priceLkr).toLocaleString()}`
                      : "Select a plan"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.durationDays}d — LKR {Number(p.priceLkr).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Admission fee block */}
            <div className="border rounded-md p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="includeAdmission"
                  checked={includeAdmission}
                  onChange={(e) => setIncludeAdmission(e.target.checked)}
                />
                Record admission fee
              </label>
              {includeAdmission && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admissionAmount">Amount (LKR)</Label>
                    <Input
                      id="admissionAmount"
                      name="admissionAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admissionMethod">Method</Label>
                    <select
                      id="admissionMethod"
                      name="admissionMethod"
                      className="h-8 border rounded-md px-2 text-sm bg-transparent w-full"
                      defaultValue="cash"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* First membership payment block */}
            <div className="border rounded-md p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="includeFirstPayment"
                  checked={includeFirstPayment}
                  onChange={(e) => setIncludeFirstPayment(e.target.checked)}
                />
                Record first membership payment
              </label>
              {includeFirstPayment && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentAmount">Amount (LKR)</Label>
                    <Input
                      key={planId}
                      id="paymentAmount"
                      name="paymentAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={selectedPlan?.priceLkr ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentMethod">Method</Label>
                    <select
                      id="paymentMethod"
                      name="paymentMethod"
                      className="h-8 border rounded-md px-2 text-sm bg-transparent w-full"
                      defaultValue="cash"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={pending || !planId}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {pending ? "Approving…" : "Approve"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
