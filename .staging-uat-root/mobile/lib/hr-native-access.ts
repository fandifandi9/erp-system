import { canAccess } from "@/lib/rbac";

/** Owner & HR: modul operasi HR di app (bukan browser). */
export function canAccessHrNativeModule(user: Record<string, unknown> | null | undefined): boolean {
  return canAccess(user, "/hr");
}
