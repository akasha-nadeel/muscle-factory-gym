"use client";

import { useActionState, useEffect, useState } from "react";
import {
  recordPayment,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Shared payment form. Used by:
 *  - the member detail page button (single member context, full kind toggle)
 *  - the dashboard "Record payment" modal (member chosen in a picker; if the
 *    member has no active membership we disable the "Membership" kind so the
 *    admin can still record an admission fee)
 */
export function RecordPaymentForm({
  memberId,
  currentMembershipId,
  successToastName,
  onSuccess,
  amount,
  onAmountChange,
  kind: controlledKind,
  onKindChange,
}: {
  memberId: string;
  currentMembershipId: string | null;
  /** Member name shown in the success toast — improves clarity when the
   * admin processes several payments back-to-back from the dashboard. */
  successToastName?: string;
  onSuccess?: () => void;
  /** Controlled amount — when provided, the field becomes controlled so the
   * parent can quick-fill it (e.g. the dashboard modal's "Pay full" button).
   * Leave undefined for uncontrolled behavior (member-detail page). */
  amount?: string;
  onAmountChange?: (next: string) => void;
  /** Optional controlled kind — same pattern as amount. */
  kind?: "membership" | "admission";
  onKindChange?: (next: "membership" | "admission") => void;
}) {
  const hasMembership = currentMembershipId !== null;
  const [internalKind, setInternalKind] = useState<"membership" | "admission">(
    hasMembership ? "membership" : "admission",
  );
  const kind = controlledKind ?? internalKind;
  const setKind = (next: "membership" | "admission") => {
    onKindChange?.(next);
    if (controlledKind === undefined) setInternalKind(next);
  };
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
      toast.success(
        successToastName
          ? `Payment recorded for ${successToastName}`
          : "Payment recorded",
      );
      onSuccess?.();
    } else if (state && !state.ok && state.error) {
      toast.error(state.error);
    }
  }, [state, successToastName, onSuccess]);

  const fieldErr = (k: "amountLkr" | "method" | "kind") =>
    state && !state.ok && state.errors ? state.errors[k] : undefined;

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />

      <div className="space-y-1.5">
        <Label>Kind</Label>
        <div className="flex gap-3 text-sm">
          <label
            className={
              hasMembership
                ? "flex items-center gap-1.5"
                : "flex items-center gap-1.5 opacity-50 cursor-not-allowed"
            }
          >
            <input
              type="radio"
              name="kindRadio"
              checked={kind === "membership"}
              onChange={() => setKind("membership")}
              disabled={!hasMembership}
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
        {!hasMembership && (
          <p className="text-xs text-muted-foreground">
            This member has no active plan — only an admission (joining) fee
            can be recorded here.
          </p>
        )}
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
          {...(amount !== undefined
            ? {
                value: amount,
                onChange: (e) => onAmountChange?.(e.target.value),
              }
            : {})}
        />
        {fieldErr("amountLkr") && (
          <p className="text-destructive text-sm">{fieldErr("amountLkr")}</p>
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
  );
}
