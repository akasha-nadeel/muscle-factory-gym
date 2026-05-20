"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function GymIdCopy({ gymId }: { gymId: number }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(String(gymId));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2">
      <div className="text-left">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-none">
          Gym ID
        </div>
        <div className="font-mono text-xl font-semibold tabular-nums leading-tight mt-1">
          #{gymId}
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy gym ID"}
        className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent transition-colors"
      >
        {copied ? (
          <Check className="size-4 text-emerald-500" />
        ) : (
          <Copy className="size-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
