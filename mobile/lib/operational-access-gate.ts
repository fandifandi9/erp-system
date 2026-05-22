import { normalizeAuthModel } from "@/lib/rbac";

/**
 * Tab Kerja (HR): antrean respons — untuk staf dengan dashboard_access bisa mengikuti check-in/out.
 * **Menu personal** (cuti, lembur, slip, dinas) tidak pernah dikunci di sini.
 */

/** Owner & HR: akses modul operasional tanpa syarat check-in / web_access. */
export function hasOperationalBypass(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return true;
  return auth.roleCode === "hr";
}

export function readOperationalAccess(user: Record<string, unknown> | null | undefined): boolean {
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

/** Modul meja kerja terkunci di luar jam operasional (belum check-in / sudah check-out). */
export function isOperationalModuleLocked(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return true;
  if (hasOperationalBypass(user)) return false;
  return !readOperationalAccess(user);
}
