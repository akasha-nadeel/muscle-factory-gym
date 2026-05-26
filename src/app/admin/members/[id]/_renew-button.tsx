"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { cn } from "@/lib/utils";
import { renewMembership, type RenewResult } from "./actions";
import { toast } from "sonner";

type PlanOption = {
  id: string;
  name: string;
  durationDays: number;
  priceLkr: string;
};

type Urgency = "expired" | "ending-soon" | "current";

function formatLkr(n: number): string {
  return `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? fullName;
  if (first.includes("@")) return "member";
  return first;
}

export function RenewMembershipButton({
  memberId,
  memberName,
  memberPhotoUrl,
  memberGymId,
  currentPlanName,
  currentEndDate,
  urgency,
  plans,
}: {
  memberId: string;
  memberName: string;
  memberPhotoUrl?: string | null;
  memberGymId?: number | null;
  currentPlanName: string | null;
  currentEndDate: string | null;
  urgency: Urgency;
  plans: PlanOption[];
}) {
  const [open, setOpen] = useState(false);
  // Default to the member's current plan (or first available) so a same-plan
  // renewal is one click; admin can switch if upgrading/downgrading.
  const defaultPlanId =
    plans.find((p) => p.name === currentPlanName)?.id ?? plans[0]?.id ?? "";
  const [planId, setPlanId] = useState<string>(defaultPlanId);
  const [includePayment, setIncludePayment] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");

  const action = renewMembership.bind(null, memberId);
  const [state, dispatch, pending] = useActionState<
    RenewResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Renewed ${memberName}`);
      setOpen(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, memberName]);

  useEffect(() => {
    if (!open) {
      setPlanId(defaultPlanId);
      setIncludePayment(true);
      setPaymentAmount("");
    }
  }, [open, defaultPlanId]);

  const selectedPlan = plans.find((p) => p.id === planId);
  // Pre-fill the renewal payment with the plan price each time the plan changes.
  useEffect(() => {
    if (includePayment && selectedPlan) {
      setPaymentAmount(selectedPlan.priceLkr);
    }
  }, [includePayment, selectedPlan]);

  const totalToday = includePayment ? Number(paymentAmount || 0) : 0;
  const firstName = firstNameOf(memberName);

  // Trigger button visual weight depends on urgency. Expired = primary
  // emerald CTA (action needed). Ending soon = outline (heads up). Mid-cycle
  // wouldn't render at all, but if it does we render as ghost-ish outline.
  const triggerVariant: "solid-emerald" | "outline-emerald" =
    urgency === "expired" ? "solid-emerald" : "outline-emerald";

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          triggerVariant === "solid-emerald"
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : "border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
        )}
      >
        <RefreshCcw className="size-4" />
        Renew membership
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Renew membership</DialogTitle>
          </DialogHeader>

          {/* Recipient identity strip */}
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <MemberAvatar
              fullName={memberName}
              photoUrl={memberPhotoUrl ?? null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{memberName}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                {memberGymId !== null && memberGymId !== undefined && (
                  <span className="font-mono">#{memberGymId}</span>
                )}
                {currentPlanName && currentEndDate ? (
                  urgency === "expired" ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {currentPlanName} expired {currentEndDate}
                    </span>
                  ) : (
                    <span>
                      {currentPlanName} ends {currentEndDate}
                    </span>
                  )
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    No active membership
                  </span>
                )}
              </div>
            </div>
          </div>

          <form action={dispatch} className="space-y-4">
            <input type="hidden" name="planId" value={planId} />
            <input
              type="hidden"
              name="includePayment"
              value={includePayment ? "on" : ""}
            />

            {/* Plan picker — cards, same pattern as Approve dialog. */}
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

            {/* Payment toggle. ON by default — renewal almost always means
                the member just paid. Admin can untoggle for a comp/freebie. */}
            <div
              className={cn(
                "rounded-lg border transition-colors",
                includePayment
                  ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                  : "border-border",
              )}
            >
              <label className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePayment}
                  onChange={(e) => setIncludePayment(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    Record renewal payment
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {selectedPlan
                      ? `Pre-filled with the ${selectedPlan.name} plan price — edit if partial.`
                      : "Pick a plan first."}
                  </div>
                </div>
              </label>
              {includePayment && (
                <div className="px-3 pb-3 pt-1 border-t border-dashed border-border/60">
                  <div className="pt-3 grid grid-cols-2 gap-3">
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
                        required={includePayment}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="paymentMethod">Method</Label>
                      <select
                        id="paymentMethod"
                        name="paymentMethod"
                        className="h-9 border rounded-md px-2 text-sm bg-background w-full"
                        defaultValue="cash"
                      >
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="paymentReference">
                        Reference (optional)
                      </Label>
                      <Input
                        id="paymentReference"
                        name="paymentReference"
                        placeholder="Receipt # or bank ref"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="paymentNotes">Notes (optional)</Label>
                      <Input id="paymentNotes" name="paymentNotes" />
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                    Renewing…
                  </>
                ) : (
                  <>Renew {firstName}</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
