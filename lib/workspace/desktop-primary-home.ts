/**
 * Phase FLEX-ORG-01 — Desktop primary home policy.
 *
 * Priority:
 * 1. Owner → /dashboard-owner
 * 2. Active Position.workspaceDomain → functional home
 * 3. Compat module/path hub (e.g. HR module → /hr) — NOT role_code
 * 4. dashboard_access → /dashboard-staff
 *
 * role_code alone never wins over Position domain.
 * Jabatan title strings never determine workspace.
 */

import { getOperationalDashboardRoute } from "@/lib/rbac";
import type { AuthUserShape } from "@/lib/auth-model";

export function resolveDesktopPrimaryHomeRoute(
  user: AuthUserShape | null | undefined,
): string {
  return getOperationalDashboardRoute(user) ?? "/profile";
}

export const DESKTOP_HOME_POLICY_NOTES = [
  "Desktop login never lands on /mobile",
  "Meja Kerja is action center inside Desktop — not the post-login destination",
  "Position.workspaceDomain is primary workspace source when set",
  "role_code is compatibility only — never overrides Position domain",
  "Module hub grant remains compat fallback when Position domain unset (Effective HR hub / module assignment granting `/hr`)",
  "No jabatan-title hardcode; authority remains capability + org + entity scope",
] as const;
