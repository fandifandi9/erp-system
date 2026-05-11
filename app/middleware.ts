import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  KNOWN_ROUTES,
  canAccess,
  getDefaultRouteForUser,
  getAllowedPathsForUser,
} from "@/lib/rbac";

// =========================
// 🚀 MIDDLEWARE
// =========================
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // PWA: manifest, icons, service worker (tanpa cookie — jangan redirect ke login)
  if (
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  // 🔓 allow login
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // 🔐 ambil cookie
  const authCookie = req.cookies.get("pb_auth");

  if (!authCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // =========================
  // 🔍 PARSE USER
  // =========================
  let user: Record<string, unknown>;

  try {
    user = JSON.parse(authCookie.value);
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const authUser = user?.model as Record<string, unknown> | undefined;
  const allowedPaths = getAllowedPathsForUser(authUser);

  if (!authUser || allowedPaths.length === 0) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // =========================
  // 🚨 VALID ROUTE CHECK
  // =========================
  const isKnown = KNOWN_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!isKnown) {
    return NextResponse.redirect(
      new URL(getDefaultRouteForUser(authUser), req.url)
    );
  }

  // =========================
  // 🚫 ROLE ACCESS CHECK
  // =========================
  if (allowedPaths.includes("*")) {
    return NextResponse.next();
  }
  const isAllowed = canAccess(authUser, pathname);

  if (!isAllowed) {
    return NextResponse.redirect(
      new URL(getDefaultRouteForUser(authUser), req.url)
    );
  }

  return NextResponse.next();
}

// =========================
// 🎯 APPLY
// =========================
export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};