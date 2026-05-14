import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isMemberRoute = createRouteMatcher(["/portal(.*)"]);
const isProtectedApi = createRouteMatcher(["/api/admin(.*)", "/api/member(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req) || isMemberRoute(req) || isProtectedApi(req)) {
    const { userId, sessionClaims, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();
    const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
    if (isAdminRoute(req) && role !== "admin") {
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
