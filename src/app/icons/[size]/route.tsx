import { renderAppIcon } from "@/lib/pwa/render-icon";

/**
 * Serves the PWA manifest icons at /icons/192 and /icons/512 as PNGs.
 * Only the two manifest sizes are allowed — anything else 404s.
 * (Next 15 route params are async — hence the awaited ctx.params.)
 */
const ALLOWED = new Set([192, 512]);

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ size: string }> },
) {
  const { size } = await ctx.params;
  const n = Number(size);
  if (!ALLOWED.has(n)) {
    return new Response("Not found", { status: 404 });
  }
  return renderAppIcon(n);
}
