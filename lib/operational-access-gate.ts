import { normalizeAuthModel } from "@/lib/rbac";

/** Rute yang tidak memerlukan akses operasional web (check-in / web_access). */
export function isOperationalPathExempt(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  /** Modul personal staff — selalu aktif (cuti, lembur, slip, luar kantor). */
  if (pathname === "/dashboard-staff" || pathname.startsWith("/dashboard-staff/")) return true;
  if (pathname.startsWith("/erp-locked")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

/** Owner & HR: akses dashboard operasional tanpa syarat check-in. */
export function hasOperationalWebBypass(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  const code = auth.roleCode;
  return code === "hr";
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
  return !readWebOperationalAccess(authUser);
}
