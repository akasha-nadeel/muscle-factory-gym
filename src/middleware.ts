import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isMemberRoute = createRouteMatcher(["/portal(.*)"]);
const isProtectedApi = createRouteMatcher(["/api/admin(.*)", "/api/member(.*)"]);

function envFromCF(key: string): string | undefined {
  try {
    const ctx = getCloudflareContext();
    const v = (ctx?.env as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // fall through
  }
  return process.env[key];
}

export default clerkMiddleware(
  async (auth, req) => {
    if (isAdminRoute(req) || isMemberRoute(req) || isProtectedApi(req)) {
      const { userId, sessionClaims, redirectToSignIn } = await auth();
      if (!userId) return redirectToSignIn();
      const role = (sessionClaims?.metadata as { role?: string } | undefined)
        ?.role;
      if (isAdminRoute(req) && role !== "admin") {
        return NextResponse.redirect(new URL("/portal", req.url));
      }
    }
  },
  () => ({
    publishableKey: envFromCF("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    secretKey: envFromCF("CLERK_SECRET_KEY"),
  }),
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js|jpg|jpeg|png|gif|svg|ico|webp|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};
