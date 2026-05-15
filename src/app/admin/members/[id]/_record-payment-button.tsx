"use client";

import { useState, useActionState, useEffect } from "react";
import {
  recordPayment,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function RecordPaymentButton({
  memberId,
  currentMembershipId,
}: {
  memberId: string;
  currentMembershipId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"membership" | "admission">("membership");
  const action = recordPayment.bind(null, {
    memberId,
    membershipId: kind === "membership" ? currentMembershipId : null,
  });
  const [state, dispatch, pending] = useActionState<
    PaymentActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Payment recorded");
      setOpen(false);
    } else if (state && !state.ok && state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const fieldErr = (k: "amountLkr" | "method" | "kind") =>
    state && !state.ok && state.errors ? state.errors[k] : undefined;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <form action={dispatch} className="space-y-4">
            <input type="hidden" name="kind" value={kind} />

            <div className="space-y-1.5">
              <Label>Kind</Label>
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="kindRadio"
                    checked={kind === "membership"}
                    onChange={() => setKind("membership")}
                  />
                  Membership
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="kindRadio"
                    checked={kind === "admission"}
                    onChange={() => setKind("admission")}
                  />
                  Admission
                </label>
              </div>
              {fieldErr("kind") && (
                <p className="text-destructive text-sm">{fieldErr("kind")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amountLkr">Amount (LKR)</Label>
              <Input
                id="amountLkr"
                name="amountLkr"
                type="number"
                min="0"
                step="0.01"
                required
              />
              {fieldErr("amountLkr") && (
                <p className="text-destructive text-sm">
                  {fieldErr("amountLkr")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <select
                id="method"
                name="method"
                className="h-8 border rounded-md px-2 text-sm bg-transparent w-full"
                defaultValue="cash"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
              {fieldErr("method") && (
                <p className="text-destructive text-sm">{fieldErr("method")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input
                id="reference"
                name="reference"
                placeholder="Receipt # or bank ref"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" name="notes" />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Record"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
