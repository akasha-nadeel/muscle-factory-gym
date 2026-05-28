/**
 * Detect Clerk's procedurally-generated default avatars.
 *
 * Clerk image URLs look like:
 *   https://img.clerk.com/<base64-encoded-json>
 * where the embedded JSON has a `type` field:
 *   - "proxy"   → a real photo (uploaded or OAuth-provided like Google)
 *   - "default" → a Clerk-generated colored silhouette
 *
 * Treating defaults as null keeps the member-list visuals coherent —
 * "no real photo" members all render the same initials avatar, instead
 * of a mix of Clerk's silhouette and our own initials fallback.
 */
export function isClerkDefaultAvatar(url: string | null | undefined): boolean {
  if (!url || !url.includes("img.clerk.com/")) return false;
  try {
    const lastSegment = url.split("/").pop() ?? "";
    // atob is available in Node 18+ (server-side) and all modern browsers.
    const json = atob(lastSegment);
    return json.includes('"type":"default"');
  } catch {
    return false;
  }
}

/**
 * Coerce a photo URL to null when it's a Clerk default. Use this as a
 * one-liner before passing to <AvatarImage src=...>.
 */
export function normalizeAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (isClerkDefaultAvatar(url)) return null;
  return url;
}
