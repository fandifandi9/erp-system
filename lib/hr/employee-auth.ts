/**
 * lib/hr/employee-auth.ts
 * Phase 31 — Server-side employee capability enforcement.
 * Phase 35I-A — Additive module assignment capability checks.
 */

import type PocketBase from "pocketbase";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import {
  hasEmployeeCapability,
  isPrivilegedTargetUser,
  type EmployeeCapability,
} from "@/lib/capabilities/employee";
import { normalizeAuthModel } from "@/lib/auth-model";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  assertActorCanAccessTarget,
  type EmployeeTargetContext,
} from "@/lib/hr/employee-scope";
import { getHrEffectiveCompanyIds } from "@/lib/access/hr-api-enforcement";

/** Legacy role capability OR module-granted employee capability. */
export function hasEffectiveEmployeeCapability(
  ctx: HrApiAuthContext,
  cap: EmployeeCapability,
): boolean {
  return hasEffectiveCapability(
    ctx.user,
    ctx.accessContext,
    cap,
    hasEmployeeCapability(ctx.user, cap),
  );
}

export function assertEmployeeCapability(
  ctx: HrApiAuthContext,
  cap: EmployeeCapability,
  message?: string,
): void {
  if (!hasEffectiveEmployeeCapability(ctx, cap)) {
    throw new HrApiError(message || `Capability '${cap}' diperlukan.`, 403);
  }
}

export function assertNotSelfTarget(ctx: HrApiAuthContext, targetUserId: string): void {
  if (ctx.userId === targetUserId) {
    throw new HrApiError("Tidak dapat mengubah akses akun sendiri.", 403);
  }
}

/**
 * Block privilege escalation: staff/manager cannot activate or change roles on any account.
 * HR cannot manage HR/owner targets without employee.manage_hr_accounts.
 */
export function assertCanManageTargetAccount(
  ctx: HrApiAuthContext,
  targetUser: Record<string, unknown>,
  action: "view" | "update" | "activate" | "deactivate" | "role_change",
): void {
  assertNotSelfTarget(ctx, String(targetUser.id || ""));

  const privileged = isPrivilegedTargetUser(targetUser);
  const actorAuth = normalizeAuthModel(ctx.user);

  if (privileged) {
    if (!hasEffectiveEmployeeCapability(ctx, "employee.manage_hr_accounts")) {
      throw new HrApiError("Akun privileged hanya dapat dikelola oleh Owner.", 403);
    }
    return;
  }

  if (action === "activate" || action === "deactivate") {
    if (!hasEffectiveEmployeeCapability(ctx, "employee.activate") && action === "activate") {
      throw new HrApiError("Anda tidak berwenang mengaktifkan akun ini.", 403);
    }
    if (!hasEffectiveEmployeeCapability(ctx, "employee.deactivate") && action === "deactivate") {
      throw new HrApiError("Anda tidak berwenang menonaktifkan akun ini.", 403);
    }
    if (
      !hasEffectiveEmployeeCapability(ctx, "employee.manage_accounts") &&
      actorAuth.accountType !== "owner"
    ) {
      throw new HrApiError("Anda tidak berwenang mengelola status akun ini.", 403);
    }
    return;
  }

  if (
    !hasEffectiveEmployeeCapability(ctx, "employee.manage_accounts") &&
    actorAuth.accountType !== "owner"
  ) {
    if (action === "update" || action === "view") {
      // view/update non-privileged handled by capability + scope
      return;
    }
    throw new HrApiError("Anda tidak berwenang mengelola akun ini.", 403);
  }
}

export async function assertEmployeeTargetAccess(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  capability: EmployeeCapability,
  target: EmployeeTargetContext,
): Promise<void> {
  await assertActorCanAccessTarget(adminPb, ctx.user, ctx.userId, capability, target, undefined, {
    accessContext: ctx.accessContext,
    actorCompanyIds: getHrEffectiveCompanyIds(ctx),
  });
}

export function stripSensitiveFields<T extends Record<string, unknown>>(
  record: T,
  canViewSensitive: boolean,
): T {
  if (canViewSensitive) return record;
  const out = { ...record };
  const sensitive = [
    "nik",
    "npwp",
    "salary",
    "leave_daily_rate",
    "extra_bonus_amount",
    "extra_bonus_enabled",
    "late_deduction_rupiah_per_minute",
    "absence_deduction_rupiah_per_day",
  ];
  for (const key of sensitive) {
    if (key in out) delete out[key];
  }
  return out;
}
