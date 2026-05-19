export type SortDir = "asc" | "desc";

export type ParsedSort<T extends string> = {
  field: T;
  dir: SortDir;
};

/**
 * Parse `?sort=field&dir=asc` search params against an allowed whitelist.
 * Falls back to `defaultSort` for unknown / missing values.
 *
 * Pure. Used in server components and tests.
 */
export function parseSortParams<T extends string>(
  sp: { sort?: string; dir?: string } | undefined,
  allowed: readonly T[],
  defaultSort: ParsedSort<T>,
): ParsedSort<T> {
  const field =
    sp?.sort && (allowed as readonly string[]).includes(sp.sort)
      ? (sp.sort as T)
      : defaultSort.field;
  const dir: SortDir = sp?.dir === "asc" || sp?.dir === "desc"
    ? sp.dir
    : defaultSort.dir;
  return { field, dir };
}

/**
 * Compute the next-state href for a column header. If we're already sorting
 * by this field, flip the direction; otherwise sort by it descending (most
 * common admin intent: "show me the biggest/most recent first").
 */
export function nextSortFor<T extends string>(
  current: ParsedSort<T>,
  clicked: T,
): ParsedSort<T> {
  if (current.field !== clicked) return { field: clicked, dir: "desc" };
  return { field: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
}
