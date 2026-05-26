"use client";

import { useState, useActionState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { approveMember, type ApproveResult } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { displayName, firstNameOf } from "@/lib/profiles/display-name";
import { formatSLDate } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PlanOption = {
  id: string;
  name: string;
  durationDays: number;
  priceLkr: string;
};

function formatLkr(n: number): string {
  return `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}


export function ApproveButton({
  memberId,
  memberName,
  memberEmail,
  memberPhotoUrl,
  memberCreatedAt,
  plans,
}: {
  memberId: string;
  memberName: string;
  memberEmail?: string | null;
  memberPhotoUrl?: string | null;
  memberCreatedAt?: Date;
  plans: PlanOption[];
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [includeAdmission, setIncludeAdmission] = useState(false);
  const [includeFirstPayment, setIncludeFirstPayment] = useState(false);
  const [admissionAmount, setAdmissionAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");

  const [state, dispatch, pending] = useActionState<
    ApproveResult | undefined,
    FormData
  >(approveMember, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Approved ${displayName(memberName)}`);
      setOpen(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, memberName]);

  // Reset transient state on close so reopening starts clean.
  useEffect(() => {
    if (!open) {
      setIncludeAdmission(false);
      setIncludeFirstPayment(false);
      setAdmissionAmount("");
      setPaymentAmount("");
    }
  }, [open]);

  const selectedPlan = plans.find((p) => p.id === planId);

  // Prefill first-payment amount with the plan price when the toggle flips
  // on or the plan changes — admin can edit if partial.
  useEffect(() => {
    if (includeFirstPayment && selectedPlan) {
      setPaymentAmount(selectedPlan.priceLkr);
    }
  }, [includeFirstPayment, selectedPlan]);

  const totalToday =
    (includeAdmission ? Number(admissionAmount || 0) : 0) +
    (includeFirstPayment ? Number(paymentAmount || 0) : 0);

  const firstName = firstNameOf(memberName);
  // If fullName is actually an email (common for OAuth-only signups), show
  // the email line below the name as muted. Otherwise show the explicit
  // email prop. Either way the admin sees both name and email.
  const displayEmail = memberEmail ?? null;
  const nameIsEmail = memberName.includes("@");

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve member</DialogTitle>
          </DialogHeader>

          {/* Recipient identity strip */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <MemberAvatar
              fullName={memberName}
              photoUrl={memberPhotoUrl ?? null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{displayName(memberName)}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                {displayEmail && !nameIsEmail && (
                  <span className="truncate">{displayEmail}</span>
                )}
                {memberCreatedAt && (
                  <span>Signed up {formatSLDate(memberCreatedAt)}</span>
                )}
              </div>
            </div>
          </div>

          <form action={dispatch} className="space-y-4">
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="planId" value={planId} />
            <input
              type="hidden"
              name="includeAdmission"
              value={includeAdmission ? "on" : ""}
            />
            <input
              type="hidden"
              name="includeFirstPayment"
              value={includeFirstPayment ? "on" : ""}
            />

            {/* Plan picker — cards instead of dropdown so price/duration
                are visible at a glance and selection is one tap. */}
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <div
                role="radiogroup"
                aria-label="Plan"
                className={cn(
                  "grid gap-2",
                  plans.length <= 2
                    ? "grid-cols-2"
                    : plans.length === 3
                      ? "grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-3",
                )}
              >
                {plans.map((p) => {
                  const active = planId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPlanId(p.id)}
                      className={cn(
                        "relative rounded-lg border p-3 text-left transition-colors",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                        active
                          ? "border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/30"
                          : "border-border bg-card hover:border-foreground/30",
                      )}
                    >
                      {active && (
                        <Check className="absolute top-2 right-2 size-3.5 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.durationDays} days
                      </div>
                      <div className="text-sm font-semibold tabular-nums mt-1.5">
                        {formatLkr(Number(p.priceLkr))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional fee blocks — collapsed by default, expand on toggle. */}
            <ExpandingFeeCard
              label="Record joining fee"
              hint="One-time fee. Skip if the member already paid or you don't charge one."
              enabled={includeAdmission}
              onToggle={setIncludeAdmission}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admissionAmount">Amount (LKR)</Label>
                  <Input
                    id="admissionAmount"
                    name="admissionAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={admissionAmount}
                    onChange={(e) => setAdmissionAmount(e.target.value)}
                    required={includeAdmission}
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
            </ExpandingFeeCard>

            <ExpandingFeeCard
              label="Record first month's payment"
              hint={
                selectedPlan
                  ? `Pre-filled with the ${selectedPlan.name} plan price — edit if partial.`
                  : "Pick a plan first."
              }
              enabled={includeFirstPayment}
              onToggle={setIncludeFirstPayment}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentAmount">Amount (LKR)</Label>
                  <Input
                    id="paymentAmount"
                    name="paymentAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required={includeFirstPayment}
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
            </ExpandingFeeCard>

            {/* Running total — only when at least one fee is being recorded. */}
            {totalToday > 0 && (
              <div className="flex items-baseline justify-between rounded-md border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Total recorded today
                </span>
                <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatLkr(totalToday)}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !planId}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Approving…
                  </>
                ) : (
                  <>Approve {firstName}</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpandingFeeCard({
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        enabled
          ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
          : "border-border",
      )}
    >
      <label className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        </div>
      </label>
      {enabled && (
        <div className="px-3 pb-3 pt-1 border-t border-dashed border-border/60">
          <div className="pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}
