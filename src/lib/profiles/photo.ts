/**
 * Decide whether a Clerk-provided photo URL represents a member's REAL
 * avatar (uploaded or OAuth-provided) — vs. Clerk's procedurally-generated
 * placeholder which should fall back to our own initials styling.
 *
 * Clerk image URLs look like:
 *   https://img.clerk.com/<base64-encoded-json>
 * where the embedded JSON has a `type` field:
 *   - "proxy"   → a real photo URL Clerk is proxying. Either:
 *                   - "uploaded/<id>" → member uploaded via Clerk profile editor
 *                   - "oauth_google/<id>" (or another OAuth provider) →
 *                     comes from the user's Google/etc account. May be
 *                     a real photo OR Google's own auto-generated letter
 *                     avatar — we can't tell from the URL alone, so we
 *                     show it. The OAuth provider is the source of truth
 *                     for "this is the user's chosen avatar".
 *                 → Render as-is.
 *   - "default" → Clerk's procedural placeholder (member never set
 *                 any avatar). Treat as null → our colored-initials
 *                 fallback handles it consistently.
 *
 * When the gym later adds an in-app photo upload, that upload becomes
 * the source of truth and overrides this Clerk URL entirely.
 */
function isRealAvatar(url: string): boolean {
  if (!url.includes("img.clerk.com/")) {
    // Non-Clerk URL — trust it (custom upload from a future feature).
    return true;
  }
  try {
    const lastSegment = url.split("/").pop() ?? "";
    const json = atob(lastSegment);
    // Anything non-"default" is a real, intentional Clerk photo.
    return !json.includes('"type":"default"');
  } catch {
    return false;
  }
}

/**
 * Coerce a photo URL to null when it's a Clerk procedural default.
 * Real OAuth photos + uploaded photos pass through unchanged.
 */
export function normalizeAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (!isRealAvatar(url)) return null;
  return url;
}
