import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  KNOWN_ROUTES,
  canAccess,
  getDefaultRouteForUser,
  getAllowedPathsForUser,
  hasHrFullWorkspaceAccess,
} from "@/lib/rbac";
import {
  buildErpLockedUrl,
  shouldDenyOperationalWebAccess,
} from "@/lib/operational-access-gate";
import { parsePbAuthCookieValue } from "@/lib/pb-auth-cookie";
import { applyPbAuthCookie } from "@/lib/pb-auth-cookie-server";
import {
  resolveMiddlewareAuthUserForLanding,
  resolveMiddlewareAuthUserForPath,
} from "@/lib/access/middleware-access-user";

function withOptionalAuthCookieRefresh(
  response: NextResponse,
  token: string | undefined,
  refreshedModel?: Record<string, unknown>,
): NextResponse {
  if (token && refreshedModel) {
    applyPbAuthCookie(response, token, refreshedModel);
  }
  return response;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname === "/systemLogoWide.png" ||
    pathname === "/systemLogo.png" ||
    /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/mobile-bridge")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/share")) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get("pb_auth");

  if (!authCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const parsed = parsePbAuthCookieValue(authCookie.value);
  const token = parsed?.token;
  let authUser = parsed?.model;
  const allowedPaths = getAllowedPathsForUser(authUser);

  if (!authUser || allowedPaths.length === 0) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname === "/entry" || pathname.startsWith("/attendance")) {
    const resolved = await resolveMiddlewareAuthUserForLanding(authUser);
    return withOptionalAuthCookieRefresh(
      NextResponse.redirect(new URL(getDefaultRouteForUser(resolved.user), req.url)),
      token,
      resolved.refreshedModel,
    );
  }

  if (pathname === "/" || pathname === "") {
    const resolved = await resolveMiddlewareAuthUserForLanding(authUser);
    return withOptionalAuthCookieRefresh(
      NextResponse.redirect(new URL(getDefaultRouteForUser(resolved.user), req.url)),
      token,
      resolved.refreshedModel,
    );
  }

  // Phase NEXT-FIX / HR-STAFF-01 — HR workspace never stays on Staff home (or personal staff tree as landing).
  if (
    pathname === "/dashboard-staff" ||
    pathname === "/dashboard-staff/" ||
    (pathname.startsWith("/dashboard-staff/") &&
      // Personal attendance remains reachable only as unlock helper; HR ops users go to /hr.
      pathname !== "/dashboard-staff/attendance" &&
      !pathname.startsWith("/dashboard-staff/attendance/"))
  ) {
    const resolved = await resolveMiddlewareAuthUserForLanding(authUser);
    if (hasHrFullWorkspaceAccess(resolved.user)) {
      return withOptionalAuthCookieRefresh(
        NextResponse.redirect(new URL("/hr", req.url)),
        token,
        resolved.refreshedModel,
      );
    }
    authUser = resolved.user;
    if (resolved.refreshedModel) {
      const res = NextResponse.next();
      return withOptionalAuthCookieRefresh(res, token, resolved.refreshedModel);
    }
  }

  // HR workspace on personal attendance URL → prefer /hr (SDM shell), except unlock-only without bypass.
  if (
    pathname === "/dashboard-staff/attendance" ||
    pathname.startsWith("/dashboard-staff/attendance/")
  ) {
    const resolved = await resolveMiddlewareAuthUserForLanding(authUser);
    if (hasHrFullWorkspaceAccess(resolved.user)) {
      return withOptionalAuthCookieRefresh(
        NextResponse.redirect(new URL("/hr", req.url)),
        token,
        resolved.refreshedModel,
      );
    }
    authUser = resolved.user;
    if (resolved.refreshedModel) {
      const res = NextResponse.next();
      return withOptionalAuthCookieRefresh(res, token, resolved.refreshedModel);
    }
  }

  const isKnown = KNOWN_ROUTES.some((route) => pathname.startsWith(route));

  if (!isKnown) {
    const resolved = await resolveMiddlewareAuthUserForLanding(authUser);
    return withOptionalAuthCookieRefresh(
      NextResponse.redirect(new URL(getDefaultRouteForUser(resolved.user), req.url)),
      token,
      resolved.refreshedModel,
    );
  }

  if (allowedPaths.includes("*")) {
    return NextResponse.next();
  }

  const resolved = await resolveMiddlewareAuthUserForPath(authUser, pathname);
  authUser = resolved.user;

  const isAllowed = canAccess(authUser, pathname);

  if (!isAllowed) {
    return withOptionalAuthCookieRefresh(
      NextResponse.redirect(new URL(getDefaultRouteForUser(authUser), req.url)),
      token,
      resolved.refreshedModel,
    );
  }

  if (shouldDenyOperationalWebAccess(pathname, authUser)) {
    const lock = new URL(
      buildErpLockedUrl(`${pathname}${req.nextUrl.search || ""}`),
      req.url,
    );
    return withOptionalAuthCookieRefresh(
      NextResponse.redirect(lock),
      token,
      resolved.refreshedModel,
    );
  }

  return withOptionalAuthCookieRefresh(NextResponse.next(), token, resolved.refreshedModel);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};
