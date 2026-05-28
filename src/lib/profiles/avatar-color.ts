/**
 * Deterministic colored background for initials avatars — the same name
 * always renders the same color. Same pattern used by Google, Slack,
 * Linear, etc. Makes the no-photo state look intentional and helps
 * the eye distinguish members at a glance.
 *
 * Palette is hand-picked for:
 *  - Sufficient contrast against white text in both light + dark mode
 *  - Saturated enough to feel "alive," muted enough not to compete
 *    with the surrounding emerald/red CTAs
 *  - Distinct hues so adjacent members are visually different
 */
const PALETTE = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-cyan-500",
] as const;

/**
 * Map a name to a stable index into PALETTE. Sum of char codes is plenty
 * for ~10 buckets — collisions are fine, we just need each name to land
 * on the SAME bucket every render.
 */
export function avatarColorClass(name: string | null | undefined): string {
  const seed = (name ?? "").trim();
  if (!seed) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[hash];
}
