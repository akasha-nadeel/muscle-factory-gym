/**
 * Display-friendly name for a member.
 *
 * When the stored fullName is actually an email (common for OAuth signups
 * where the member never set their first/last name), strip the @domain part
 * so the UI shows "nadeelakasha.2003" instead of
 * "nadeelakasha.2003@gmail.com". Once the member sets a real name, this
 * function passes through unchanged.
 *
 * Pure / synchronous / no DB. Safe to call at every JSX render site.
 *
 * Use the RAW fullName for back-end comparisons (e.g. type-to-confirm
 * checks where the source of truth is the DB value), and use this helper
 * for everything the admin/member SEES.
 */
export function displayName(name: string | null | undefined): string {
  if (!name) return "Member";
  const at = name.indexOf("@");
  if (at > 0) return name.slice(0, at);
  return name;
}

/** Best-effort first name for personalised CTAs ("Approve Akila"). Falls
 * back to "member" if the name looks like an email or is empty. */
export function firstNameOf(name: string | null | undefined): string {
  if (!name) return "member";
  const display = displayName(name);
  const first = display.trim().split(/\s+/)[0] ?? display;
  if (first.includes("@") || !first) return "member";
  return first;
}
