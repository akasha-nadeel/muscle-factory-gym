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
import { displayName } from "@/lib/profiles/display-name";
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

/**
 * Dashboard primary action: find a member, then record their payment in
 * one flow. Single dialog with two phases so there's only ever one modal
 * on screen — Escape and "Change member" share the same mental model.
 */
export function RecordPaymentModal() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MemberResult | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSelected(null);
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
            <MemberPicker onPick={setSelected} />
          ) : (
            <div className="space-y-4">
              <SelectedMemberHeader
                member={selected}
                onChange={() => setSelected(null)}
              />
              {/* `key` forces a fresh form (state + payment-context fetch) when
                  the admin picks a different member without closing the dialog. */}
              <RecordPaymentForm
                key={selected.id}
                memberId={selected.id}
                currentMembershipId={selected.activeMembershipId}
                successToastName={displayName(selected.fullName)}
                onSuccess={() => handleOpenChange(false)}
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
}: {
  member: MemberResult;
  onChange: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
      <MemberAvatar
        fullName={member.fullName}
        photoUrl={member.photoUrl}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{displayName(member.fullName)}</div>
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
  );
}

function MemberPicker({ onPick }: { onPick: (m: MemberResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MemberResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
                        {displayName(m.fullName)}
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
