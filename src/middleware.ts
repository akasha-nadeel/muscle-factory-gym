import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isMemberRoute = createRouteMatcher([
  "/portal(.*)",
  // /checkin/scan is token-bearing but member-identified via Clerk session.
  // Adding it here makes Clerk redirect to sign-in (preserving ?t= in the
  // return URL) so a fresh phone gets the one-time sign-in then auto-checks-in.
  "/checkin/scan(.*)",
]);
const isProtectedApi = createRouteMatcher(["/api/admin(.*)", "/api/member(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req) || isMemberRoute(req) || isProtectedApi(req)) {
    const { userId, sessionClaims, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();
    const role = (sessionClaims?.metadata as { role?: string } | undefined)
      ?.role;
    // Send admins straight to /admin if they hit /portal. Avoids the brief
    // "blank /portal" flash that used to happen when role checks lived only
    // in layouts. (When claims are stale and role is undefined we let it
    // through; the layout's DB-backed check handles that case.)
    if (isMemberRoute(req) && role === "admin") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    // Only redirect /admin → /portal when claims POSITIVELY say non-admin.
    // If role is undefined (stale JWT right after sign-in), let it through
    // and let the admin layout consult the DB — otherwise we get a loop.
    if (isAdminRoute(req) && role && role !== "admin") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js|jpg|jpeg|png|gif|svg|ico|webp|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};
