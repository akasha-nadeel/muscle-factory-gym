"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, AlertTriangle, ArrowRight } from "lucide-react";
import {
  recordPayment,
  undoRecentPayment,
  type PaymentActionResult,
} from "@/app/admin/payments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { todayInSL } from "@/lib/tz";

type PaymentContext = {
  outstandingLkr: string | null;
  nextPaymentDue: string | null;
  planPriceLkr: string | null;
  planName: string | null;
  /** End date of the member's currently-active membership (YYYY-MM-DD).
   * Drives the "did you mean Renew?" safeguard. */
  currentEndDate: string | null;
  lastPayment: {
    amountLkr: string;
    paidAt: string;
    method: "cash" | "bank_transfer" | "payhere";
    kind: "membership" | "admission";
  } | null;
  /** The single succeeded admission payment, if one exists. The DB enforces
   * uniqueness via a partial index, so this is at most one row. */
  admissionPaid: { amountLkr: string; paidAt: string } | null;
};

/** Daily-or-tomorrow threshold for the renewal safeguard. Anything beyond
 *  this gives the admin enough runway to do a normal mid-cycle payment.
 *  At/under it, the wrong action is almost certainly Record Payment. */
const RENEW_NUDGE_DAYS = 2;

/**
 * Decide whether to surface the renewal-safeguard banner. The banner
 * targets the high-damage case: admin records a payment on a Daily/Monthly
 * plan that's about to expire (or already has), thinking it extends them,
 * when it actually just logs against the dying cycle.
 *
 * @returns "expired" | "today" | "tomorrow" | null
 */
function renewSafeguardState(
  kind: "membership" | "admission",
  hasMembership: boolean,
  currentEndDate: string | null,
): "expired" | "today" | "tomorrow" | null {
  if (kind !== "membership" || !hasMembership || !currentEndDate) return null;
  const today = todayInSL();
  if (currentEndDate < today) return "expired";
  if (currentEndDate === today) return "today";
  // currentEndDate === today + 1 day?
  const [y, m, d] = today.split("-").map(Number);
  const tomorrowDate = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(
    tomorrowDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;
  if (currentEndDate === tomorrow) return "tomorrow";
  // Beyond 2 days — admin is doing a normal mid-cycle payment, no nudge.
  const diffMs =
    new Date(`${currentEndDate}T00:00:00Z`).getTime() -
    new Date(`${today}T00:00:00Z`).getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  return diffDays <= RENEW_NUDGE_DAYS ? "tomorrow" : null;
}

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
  onSwitchToRenew,
}: {
  memberId: string;
  currentMembershipId: string | null;
  /** Member name shown in the success toast — improves clarity when the
   * admin processes several payments back-to-back from the dashboard. */
  successToastName?: string;
  onSuccess?: () => void;
  /** When provided, a Cancel button is shown in the footer. */
  onCancel?: () => void;
  /** When provided, the renewal-safeguard banner renders an "Open Renew
   * instead" CTA that calls this. Caller is responsible for closing this
   * dialog and triggering the Renew dialog. */
  onSwitchToRenew?: () => void;
}) {
  const hasMembership = currentMembershipId !== null;
  const [kind, setKind] = useState<"membership" | "admission">(
    hasMembership ? "membership" : "admission",
  );
  const [amount, setAmount] = useState("");
  const [ctx, setCtx] = useState<PaymentContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  /** Admin can dismiss the safeguard banner if they really do mean to
   *  record a payment without renewing (rare edge cases). */
  const [renewNudgeDismissed, setRenewNudgeDismissed] = useState(false);

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

  // Guard so the success/error toast fires exactly once per state object.
  // Without this, a parent re-render (triggered by onSuccess() closing
  // the dialog) creates a new onSuccess function reference → effect deps
  // change → effect re-runs → duplicate toast on screen.
  const handledStateRef = useRef<PaymentActionResult | undefined>(undefined);

  useEffect(() => {
    if (!state || handledStateRef.current === state) return;
    handledStateRef.current = state;

    if (state.ok) {
      // Capture the just-created paymentId for the Undo action. When
      // present, the success toast offers a 10-second window to delete
      // the row outright (handles "I clicked Record on the wrong amount /
      // wrong member" mistakes). After that, the regular Refund flow
      // takes over.
      const paymentId = state.paymentId;
      toast.success(
        successToastName
          ? `Payment recorded for ${successToastName}`
          : "Payment recorded",
        paymentId
          ? {
              duration: 10_000,
              // Replace the default check icon with a draining countdown
              // ring — the admin sees how much undo time is left at a
              // glance instead of having to mentally race the toast.
              icon: <UndoCountdownRing />,
              action: {
                label: "Undo",
                onClick: async () => {
                  const r = await undoRecentPayment(paymentId);
                  if (r.ok) {
                    toast.success("Payment undone");
                  } else if (!r.ok) {
                    toast.error(r.error);
                  }
                },
              },
            }
          : undefined,
      );
      onSuccess?.();
    } else if (state.error) {
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
  const admissionAlreadyPaid =
    kind === "admission" && ctx?.admissionPaid != null;
  /** Renewal-safeguard — null when the membership is healthy mid-cycle,
   *  otherwise "expired" | "today" | "tomorrow" for the banner copy. */
  const renewState = useMemo(
    () =>
      renewSafeguardState(kind, hasMembership, ctx?.currentEndDate ?? null),
    [kind, hasMembership, ctx?.currentEndDate],
  );
  const showRenewNudge = renewState !== null && !renewNudgeDismissed;

  // Collapsed state — when admission is already paid, the form fields are
  // irrelevant (the DB unique index will reject any submission anyway).
  // Show only the status panel + Kind toggle + Close, no form fields.
  if (admissionAlreadyPaid && !ctxLoading) {
    return (
      <div className="space-y-4">
        <AdmissionStatusPanel
          loading={false}
          admissionPaid={ctx?.admissionPaid ?? null}
        />

        {/* Kind toggle still rendered so admin can switch back to
            Membership without closing the dialog (handy when picking the
            wrong tab by mistake). */}
        {hasMembership && (
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <div
              role="radiogroup"
              aria-label="Payment kind"
              className="inline-flex w-full sm:w-auto rounded-md border p-0.5 bg-muted/40 text-xs"
            >
              <KindTab
                label="Membership"
                active={false}
                onSelect={() => setKind("membership")}
              />
              <KindTab
                label="Admission"
                active={true}
                onSelect={() => setKind("admission")}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={dispatch} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />

      {/* Renewal safeguard — top-of-form banner when the current membership
          is at/past expiry. Banking-app warning pattern: clear copy on
          consequence, primary CTA to the recommended path (Renew),
          secondary affordance to dismiss when admin really means to record
          a payment on the dying cycle. */}
      {showRenewNudge && renewState && (
        <RenewSafeguardBanner
          state={renewState}
          planName={ctx?.planName ?? null}
          canSwitchToRenew={!!onSwitchToRenew}
          onSwitchToRenew={() => {
            onSwitchToRenew?.();
          }}
          onDismiss={() => setRenewNudgeDismissed(true)}
        />
      )}

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

      {/* Admission status panel — shown when admin picks Admission and
          the fee hasn't been recorded yet (the already-paid case short-
          circuits above). */}
      {kind === "admission" && (
        <AdmissionStatusPanel
          loading={ctxLoading}
          admissionPaid={ctx?.admissionPaid ?? null}
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
          // Block submit when admission is already paid — the DB unique
          // index would reject it anyway; we save the admin a failed click.
          disabled={
            pending ||
            (kind === "admission" && ctx?.admissionPaid !== null && ctx?.admissionPaid !== undefined)
          }
          className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:bg-emerald-500/50 disabled:text-white disabled:opacity-100"
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
            onClick={() => onUseFullAmount(outstanding.toString())}
            // Solid amber to match the panel's amber language — reads as
            // the panel's primary affordance instead of an outline that
            // disappears against the amber tint in light mode. White text
            // in both themes for max contrast against the saturated bg.
            className="shrink-0 bg-amber-500 text-white hover:bg-amber-600 hover:text-white border-transparent shadow-sm"
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

/**
 * Draining countdown ring used as the Record Payment success-toast icon.
 * Two stacked SVG circles: a faint track + an animated foreground ring
 * whose stroke-dashoffset goes from 0 → full circumference over 10s,
 * making the ring visually empty out as the undo window expires.
 * Animation lives in globals.css (`@keyframes toast-undo-countdown`).
 */
function UndoCountdownRing() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      style={{ transform: "rotate(-90deg)" }}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.3"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="62.83"
        style={{
          animation: "toast-undo-countdown 10s linear forwards",
        }}
      />
    </svg>
  );
}

/**
 * Renewal safeguard banner. Shown at the top of the Record Payment form
 * when the active membership is at/past expiry — the high-damage window
 * where the wrong button (Record Payment vs Renew) creates the most
 * customer-support pain (member pays cash, plan still dies, can't check
 * in next day).
 *
 * Design intent — banking-app warning pattern:
 *   - Amber surface (warning, not error — the admin isn't blocked)
 *   - Plain-language title and consequence ("won't extend")
 *   - Primary CTA = the recommended path (Renew)
 *   - Dismissible — admin can keep going when they really mean it
 *     (e.g. recording a past-due payment that was missed last cycle)
 *
 * The CTA renders only when the parent provides onSwitchToRenew (member
 * detail page does; the dashboard modal doesn't, since the Renew button
 * isn't reachable from there). Without the CTA, the banner is still
 * informational — admin knows they may be making a mistake.
 */
function RenewSafeguardBanner({
  state,
  planName,
  canSwitchToRenew,
  onSwitchToRenew,
  onDismiss,
}: {
  state: "expired" | "today" | "tomorrow";
  planName: string | null;
  canSwitchToRenew: boolean;
  onSwitchToRenew: () => void;
  onDismiss: () => void;
}) {
  const plan = planName ?? "membership";
  const headline =
    state === "expired"
      ? `${plan} has already expired`
      : state === "today"
        ? `${plan} ends today`
        : `${plan} ends tomorrow`;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/50 bg-amber-50/70 dark:bg-amber-950/30 p-3 space-y-2.5"
    >
      <div className="flex items-start gap-2.5">
        <div className="size-8 shrink-0 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center">
          <AlertTriangle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {headline} — did you mean to renew?
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
            Recording a payment here{" "}
            <span className="font-medium">won&apos;t extend</span> the
            membership. To start a new cycle, use{" "}
            <span className="font-medium">Renew membership</span>.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pl-10">
        {canSwitchToRenew && (
          <Button
            type="button"
            size="sm"
            onClick={onSwitchToRenew}
            className="bg-amber-500 text-white hover:bg-amber-600 border-transparent"
          >
            Open Renew instead
            <ArrowRight className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDismiss}
          className="border-amber-500/40 text-amber-900 dark:text-amber-100 hover:bg-amber-500/10"
        >
          Continue with payment
        </Button>
      </div>
    </div>
  );
}

/**
 * Admission-fee status panel. Shown above the form when kind=admission so
 * the admin knows upfront whether the joining fee was already recorded
 * (preventing a wasted submit that the DB partial-unique index would
 * reject). When already paid, the surrounding form's submit button is
 * also disabled to make the "no-op" state unambiguous.
 */
function AdmissionStatusPanel({
  loading,
  admissionPaid,
}: {
  loading: boolean;
  admissionPaid: { amountLkr: string; paidAt: string } | null;
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        Loading admission status…
      </div>
    );
  }
  const fmt = (lkr: string | number) =>
    `LKR ${Number(lkr).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`;

  if (admissionPaid) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-2.5 text-sm">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">Joining fee</span>
            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              Already paid
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {fmt(admissionPaid.amountLkr)} on{" "}
            {formatDateSL(admissionPaid.paidAt.slice(0, 10))}
            {" • "}
            <span className="text-amber-600 dark:text-amber-400">
              Only one joining fee per member
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">Joining fee</span>
        <span className="font-medium">Not recorded yet</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        One-time fee. Recorded only once per member.
      </div>
    </div>
  );
}
