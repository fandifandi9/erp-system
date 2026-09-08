import { normalizeAuthModel } from "@/lib/auth-model";
import { readModuleWebPathsFromUser } from "@/lib/access/context";
import { hasHrOperationalWorkspace } from "@/lib/org/hr-workspace-access";

/** Personal desktop check-in — cadangan kedua jika companion/mobile tidak dipakai. */
export const DESKTOP_ATTENDANCE_UNLOCK_PATH = "/dashboard-staff/attendance";

/** Web mirror app HP — absensi, pengajuan, companion (unlock utama saat belum check-in). */
export const MOBILE_COMPANION_PATH = "/mobile";

/** Layar peringatan lock (bukan error) sebelum absensi. */
export const ERP_LOCKED_PATH = "/erp-locked";

/** Rute yang tidak memerlukan akses operasional web (check-in / web_access). */
export function isOperationalPathExempt(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  /** Mirror app HP + modul personal staff — selalu aktif tanpa web_access. */
  if (pathname === MOBILE_COMPANION_PATH || pathname.startsWith(`${MOBILE_COMPANION_PATH}/`)) {
    return true;
  }
  if (pathname === "/dashboard-staff" || pathname.startsWith("/dashboard-staff/")) return true;
  if (pathname === "/hr/reports" || pathname.startsWith("/hr/reports/")) return true;
  if (pathname.startsWith(ERP_LOCKED_PATH)) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

/** Staff+module assignment: operational access for assigned module web paths only. */
export function hasModuleOperationalPathAccess(
  user: Record<string, unknown> | null | undefined,
  pathname: string,
): boolean {
  const paths = readModuleWebPathsFromUser(user);
  if (!paths.length) return false;
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Bypass check-in gate:
 * - Owner
 * - HR-STAFF-01: Position domain HR or module hub `/hr`
 * - LEGACY: role_code=hr (compat only — not primary workspace resolver)
 */
export function hasOperationalWebBypass(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  if (hasHrOperationalWorkspace(user)) return true;
  return auth.roleCode === "hr";
}

export function readWebOperationalAccess(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const v = user.web_access;
  if (typeof v === "boolean") return v;
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

/** Middleware / guard: blokir ERP operasional jika user tidak punya web_access dan bukan bypass. */
export function shouldDenyOperationalWebAccess(
  pathname: string,
  authUser: Record<string, unknown> | null | undefined
): boolean {
  if (isOperationalPathExempt(pathname)) return false;
  if (!authUser) return true;
  if (hasOperationalWebBypass(authUser)) return false;
  if (hasModuleOperationalPathAccess(authUser, pathname)) return false;
  return !readWebOperationalAccess(authUser);
}

function safeReturnPath(raw: string): string {
  const p = String(raw || "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return "/dashboard-staff";
  if (p.startsWith("/login") || p.startsWith(ERP_LOCKED_PATH)) return "/dashboard-staff";
  if (p === MOBILE_COMPANION_PATH || p.startsWith(`${MOBILE_COMPANION_PATH}?`)) {
    return "/dashboard-staff";
  }
  if (
    p === DESKTOP_ATTENDANCE_UNLOCK_PATH ||
    p.startsWith(`${DESKTOP_ATTENDANCE_UNLOCK_PATH}?`)
  ) {
    return "/dashboard-staff";
  }
  return p;
}

/** Layar lock + next = dashboard yang akan dibuka setelah absensi berhasil. */
export function buildErpLockedUrl(returnPath: string): string {
  const next = safeReturnPath(returnPath);
  return `${ERP_LOCKED_PATH}?next=${encodeURIComponent(next)}`;
}

/** Unlock utama: companion /mobile (cerminan app HP). */
export function buildMobileUnlockUrl(returnPath: string): string {
  const next = safeReturnPath(returnPath);
  return `${MOBILE_COMPANION_PATH}?next=${encodeURIComponent(next)}`;
}

/** Cadangan: absensi desktop penuh. */
export function buildAttendanceUnlockUrl(returnPath: string): string {
  const next = safeReturnPath(returnPath);
  return `${DESKTOP_ATTENDANCE_UNLOCK_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Setelah login: jika belum check-in → layar lock (peringatan).
 * Owner/HR workspace / web_access → langsung home.
 */
export function resolveLandingWithAttendanceGate(
  user: Record<string, unknown> | null | undefined,
  preferredHome: string,
): string {
  const home = safeReturnPath(preferredHome || "/profile");
  if (home === "/profile" || home.startsWith("/profile/")) return home;
  if (hasOperationalWebBypass(user) || readWebOperationalAccess(user)) return home;
  return buildErpLockedUrl(home);
}
