/**
 * Derive 1–2 letter initials from a name for avatar fallbacks.
 *
 *   "Akasha Nadeel"  → "AN"
 *   "Madonna"        → "MA"
 *   ""               → "?"
 *   "  john  doe  "  → "JD"
 *
 * Unicode-safe (uses Array.from to split code points), so non-ASCII names
 * render their actual first character rather than mojibake.
 */
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const chars = Array.from(parts[0]!);
    return chars.slice(0, 2).join("").toUpperCase();
  }
  const first = Array.from(parts[0]!)[0] ?? "";
  const last = Array.from(parts[parts.length - 1]!)[0] ?? "";
  return (first + last).toUpperCase();
}
