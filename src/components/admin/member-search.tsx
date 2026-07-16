"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { displayName } from "@/lib/profiles/display-name";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  fullName: string;
  email: string;
  gymId: number | null;
  photoUrl: string | null;
};

export function MemberSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Member[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      setErrored(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    setErrored(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/search-members?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setErrored(true);
          setResults(null);
          return;
        }
        const json = (await res.json()) as { results: Member[] };
        setResults(json.results);
      } catch {
        setErrored(true);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function go(memberId: string) {
    setOpen(false);
    setQ("");
    router.push(`/admin/members/${memberId}`);
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Find members…"
          className={cn(
            // Fills its wrapper: full-width in the mobile row and in the
            // desktop top-bar's centred max-width slot.
            "h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-lg z-30 max-h-80 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </div>
          )}
          {!loading && errored && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Search unavailable.
            </div>
          )}
          {!loading && !errored && results && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No members found.
            </div>
          )}
          {!loading && !errored && results && results.length > 0 && (
            <ul className="py-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => go(m.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <div className="font-medium">{displayName(m.fullName)}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.gymId !== null && (
                        <span className="font-mono mr-2">#{m.gymId}</span>
                      )}
                      {m.email}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
