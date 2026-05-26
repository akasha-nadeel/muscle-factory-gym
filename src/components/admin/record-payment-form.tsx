"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import {
  recordPayment,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PaymentContext = {
  outstandingLkr: string | null;
  nextPaymentDue: string | null;
  planPriceLkr: string | null;
  planName: string | null;
  lastPayment: {
    amountLkr: string;
    paidAt: string;
    method: "cash" | "bank_transfer" | "payhere";
    kind: "membership" | "admission";
  } | null;
};

/**
 * Shared payment form. Used by:
 *  - the dashboard "Record payment" modal (member chosen in a picker)
 *  - the member detail page button (single member context)
 *
 * Self-contained: manages its own amount/kind state, fetches the member's
 * payment context on mount, and renders the outstanding panel + quick-fill
 * pill inside the form so both surfaces look the same.
 *
 * Reset behavior: the parent should pass `key={memberId}` when the member
 * can change inside the same dialog (the dashboard modal does this) so the
 * form remounts with fresh state.
 */
export function RecordPaymentForm({
  memberId,
  currentMembershipId,
  successToastName,
  onSuccess,
  onCancel,
}: {
  memberId: string;
  currentMembershipId: string | null;
  /** Member name shown in the success toast — improves clarity when the
   * admin processes several payments back-to-back from the dashboard. */
  successToastName?: string;
  onSuccess?: () => void;
  /** When provided, a Cancel button is shown in the footer. */
  onCancel?: () => void;
}) {
  const hasMembership = currentMembershipId !== null;
  const [kind, setKind] = useState<"membership" | "admission">(
    hasMembership ? "membership" : "admission",
  );
  const [amount, setAmount] = useState("");
  const [ctx, setCtx] = useState<PaymentContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  // Fetch payment context (outstanding, next due, last payment) on mount.
  useEffect(() => {
    let cancelled = false;
    setCtxLoading(true);
    setCtx(null);
    fetch(`/api/admin/members/${memberId}/payment-context`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: PaymentContext | null) => {
        if (!cancelled) {
          setCtx(json);
          setCtxLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCtxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

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

  const outstanding =
    ctx?.outstandingLkr !== null && ctx?.outstandingLkr !== undefined
      ? Number(ctx.outstandingLkr)
      : null;
  const showOutstanding = kind === "membership" && hasMembership;

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />

      {/* Outstanding panel — only when recording a membership payment. */}
      {showOutstanding && (
        <OutstandingPanel
          loading={ctxLoading}
          outstanding={outstanding}
          nextPaymentDue={ctx?.nextPaymentDue ?? null}
          lastPayment={ctx?.lastPayment ?? null}
          onUseFullAmount={(v) => setAmount(v)}
        />
      )}

      {/* Kind — segmented control. Admission tab is always available; the
          Membership tab is disabled when the member has no active plan. */}
      <div className="space-y-1.5">
        <Label>Kind</Label>
        <div
          role="radiogroup"
          aria-label="Payment kind"
          className="inline-flex w-full sm:w-auto rounded-md border p-0.5 bg-muted/40 text-xs"
        >
          <KindTab
            label="Membership"
            active={kind === "membership"}
            disabled={!hasMembership}
            onSelect={() => hasMembership && setKind("membership")}
          />
          <KindTab
            label="Admission"
            active={kind === "admission"}
            onSelect={() => setKind("admission")}
          />
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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
          className="h-9 border rounded-md px-2 text-sm bg-background w-full"
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

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className="bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Recording…
            </>
          ) : (
            "Record payment"
          )}
        </Button>
      </div>
    </form>
  );
}

function KindTab({
  label,
  active,
  disabled,
  onSelect,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex-1 sm:flex-initial px-3 py-1.5 rounded-[5px] transition-colors text-sm",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {label}
    </button>
  );
}

function OutstandingPanel({
  loading,
  outstanding,
  nextPaymentDue,
  lastPayment,
  onUseFullAmount,
}: {
  loading: boolean;
  outstanding: number | null;
  nextPaymentDue: string | null;
  lastPayment: PaymentContext["lastPayment"];
  onUseFullAmount: (amount: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        Loading balance…
      </div>
    );
  }
  if (outstanding === null) return null;

  const isOverdue = outstanding > 0;
  const fmt = (lkr: string | number) =>
    `LKR ${Number(lkr).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`;

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        isOverdue
          ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20"
          : "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {isOverdue ? "Outstanding" : "Status"}
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                isOverdue
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {isOverdue ? fmt(outstanding) : "Settled"}
            </span>
          </div>
          {nextPaymentDue && (
            <div className="text-xs text-muted-foreground">
              Next due {formatDateSL(nextPaymentDue)}
              {lastPayment && (
                <>
                  {" • "}Last paid {fmt(lastPayment.amountLkr)} on{" "}
                  {formatDateSL(lastPayment.paidAt.slice(0, 10))}
                </>
              )}
            </div>
          )}
        </div>
        {isOverdue && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onUseFullAmount(outstanding.toString())}
            className="shrink-0"
          >
            <RotateCcw className="size-3.5" />
            Use {fmt(outstanding)}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDateSL(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][m - 1];
  return `${month} ${d}, ${y}`;
}
