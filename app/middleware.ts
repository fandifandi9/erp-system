import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  KNOWN_ROUTES,
  canAccess,
  getDefaultRouteForUser,
  getAllowedPathsForUser,
} from "@/lib/rbac";
import { shouldDenyOperationalWebAccess } from "@/lib/operational-access-gate";

// =========================
// 🚀 MIDDLEWARE
// =========================
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Aset publik (ikon, SW cleanup) — tanpa cookie
  if (
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname === "/icon" ||
    pathname === "/apple-icon"
  ) {
    return NextResponse.next();
  }

  // 🔓 allow login
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Bridge sesi app native → web (tanpa cookie; auth lewat hash)
  if (pathname.startsWith("/mobile-bridge")) {
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

  /** URL lawas modul absensi web → dashboard kerja (absensi hanya app native). */
  if (pathname === "/entry" || pathname.startsWith("/attendance")) {
    return NextResponse.redirect(new URL(getDefaultRouteForUser(authUser), req.url));
  }

  /** Beranda / — ke dashboard kerja atau profil. */
  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL(getDefaultRouteForUser(authUser), req.url));
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

  if (shouldDenyOperationalWebAccess(pathname, authUser)) {
    const lock = new URL("/erp-locked", req.url);
    if (pathname !== "/erp-locked") {
      lock.searchParams.set("next", `${pathname}${req.nextUrl.search || ""}`);
    }
    return NextResponse.redirect(lock);
  }

  return NextResponse.next();
}

// =========================
// 🎯 APPLY
// =========================
export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};