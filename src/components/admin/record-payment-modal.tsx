"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/admin/member-avatar";
import { RecordPaymentForm } from "@/components/admin/record-payment-form";
import { cn } from "@/lib/utils";

type MemberResult = {
  id: string;
  fullName: string;
  email: string | null;
  gymId: number | null;
  photoUrl: string | null;
  activeMembershipId: string | null;
  activePlanName: string | null;
  /** Cycle-aware outstanding (membership). Null when there's no active plan. */
  outstandingLkr: string | null;
};

function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

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
 * Dashboard primary action: find a member, then record their payment in
 * one flow. Single dialog with two phases so there's only ever one modal
 * on screen — Escape and "Change member" share the same mental model.
 */
export function RecordPaymentModal() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MemberResult | null>(null);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"membership" | "admission">("membership");

  function pickMember(m: MemberResult) {
    setSelected(m);
    setKind(m.activeMembershipId ? "membership" : "admission");
    setAmount("");
  }

  function backToPicker() {
    setSelected(null);
    setAmount("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelected(null);
      setAmount("");
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500"
      >
        <Wallet className="size-4" />
        Record payment
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {selected === null ? (
            <MemberPicker onPick={pickMember} />
          ) : (
            <div className="space-y-4">
              <SelectedMemberHeader
                member={selected}
                onChange={backToPicker}
                kind={kind}
                onUseFullAmount={(v) => setAmount(v)}
              />
              <RecordPaymentForm
                memberId={selected.id}
                currentMembershipId={selected.activeMembershipId}
                successToastName={selected.fullName}
                onSuccess={() => handleOpenChange(false)}
                amount={amount}
                onAmountChange={setAmount}
                kind={kind}
                onKindChange={setKind}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SelectedMemberHeader({
  member,
  onChange,
  kind,
  onUseFullAmount,
}: {
  member: MemberResult;
  onChange: () => void;
  kind: "membership" | "admission";
  onUseFullAmount: (amount: string) => void;
}) {
  const [ctx, setCtx] = useState<PaymentContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCtx(null);
    fetch(`/api/admin/members/${member.id}/payment-context`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: PaymentContext | null) => {
        if (!cancelled) {
          setCtx(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  return (
    <div className="space-y-3">
      {/* Identity row */}
      <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
        <MemberAvatar
          fullName={member.fullName}
          photoUrl={member.photoUrl}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{member.fullName}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {member.gymId !== null && (
              <span className="font-mono">#{member.gymId}</span>
            )}
            {member.activePlanName ? (
              <span>{member.activePlanName}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                No active plan
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
        >
          <ArrowLeft className="size-3" />
          Change
        </button>
      </div>

      {/* Outstanding panel — only relevant for membership payments. Admission
          is a one-time fee that doesn't accumulate against the plan price. */}
      {kind === "membership" && member.activeMembershipId && (
        <OutstandingPanel
          loading={loading}
          ctx={ctx}
          onUseFullAmount={onUseFullAmount}
        />
      )}
    </div>
  );
}

function OutstandingPanel({
  loading,
  ctx,
  onUseFullAmount,
}: {
  loading: boolean;
  ctx: PaymentContext | null;
  onUseFullAmount: (amount: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        Loading balance…
      </div>
    );
  }
  if (!ctx || ctx.outstandingLkr === null) return null;

  const outstanding = Number(ctx.outstandingLkr);
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
            <span className="text-xs text-muted-foreground">Outstanding</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                isOverdue
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {fmt(outstanding)}
            </span>
          </div>
          {ctx.nextPaymentDue && (
            <div className="text-xs text-muted-foreground">
              Next due {formatDateSL(ctx.nextPaymentDue)}
              {ctx.lastPayment && (
                <>
                  {" • "}Last paid {fmt(ctx.lastPayment.amountLkr)} on{" "}
                  {formatDateSL(toDateString(ctx.lastPayment.paidAt))}
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
            Use {fmt(outstanding)}
          </Button>
        )}
      </div>
    </div>
  );
}

function toDateString(iso: string): string {
  // The API returns paidAt as a full ISO timestamp; for display we just want
  // the calendar date so we don't pull in the timezone helper here.
  return iso.slice(0, 10);
}

function formatDateSL(yyyyMmDd: string): string {
  // Cheap inline formatter — "Jun 15, 2026". Avoids importing date-fns into a
  // client bundle just for this one label.
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

function MemberPicker({ onPick }: { onPick: (m: MemberResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MemberResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search on first paint so the admin can start typing.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fetch on mount with empty q to render every active member, then re-fetch
  // (debounced) whenever the query changes. Empty q is allowed because the
  // search endpoint serves the full active-members list when activeOnly=true.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    setErrored(false);
    debounceRef.current = setTimeout(
      async () => {
        try {
          const res = await fetch(
            `/api/admin/search-members?activeOnly=true&q=${encodeURIComponent(q)}`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            setErrored(true);
            setResults(null);
            return;
          }
          const json = (await res.json()) as { results: MemberResult[] };
          setResults(json.results);
        } catch {
          setErrored(true);
          setResults(null);
        } finally {
          setLoading(false);
        }
      },
      // No debounce on first fetch (empty q); 200 ms after the admin starts
      // typing so each keystroke doesn't hammer the API.
      q === "" ? 0 : 200,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or gym ID…"
          className={cn(
            "h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        />
      </div>

      <div className="min-h-[16rem] max-h-[28rem] overflow-auto rounded-md border bg-background">
        {loading && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Loading members…
          </div>
        )}
        {!loading && errored && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Search unavailable. Try again.
          </div>
        )}
        {!loading && !errored && results && results.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {q
              ? "No active members match your search."
              : "No active members yet."}
          </div>
        )}
        {!loading && !errored && results && results.length > 0 && (
          <ul className="divide-y">
            {results.map((m) => {
              const owed =
                m.outstandingLkr !== null ? Number(m.outstandingLkr) : null;
              const isOverdue = owed !== null && owed > 0;
              const isSettled = owed !== null && owed <= 0;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onPick(m)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <MemberAvatar
                      fullName={m.fullName}
                      photoUrl={m.photoUrl}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                        {m.gymId !== null && (
                          <span className="font-mono">#{m.gymId}</span>
                        )}
                        {m.activePlanName ? (
                          <span>{m.activePlanName}</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            No active plan
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Right-aligned balance chip. Amber = owes money, muted
                        green = settled, hidden when there's no active plan
                        (the "No active plan" badge above already covers that
                        case). */}
                    {isOverdue && (
                      <span className="shrink-0 inline-flex items-center rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                        {formatLkr(owed!)}
                      </span>
                    )}
                    {isSettled && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Settled
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
