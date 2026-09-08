/**
 * lib/hr/work-schedule-auth.ts
 * Phase 33B — Schedule capability + scope enforcement.
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertCompanyInScope } from "@/lib/hr/company-scope";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import { getHrWorkingCompanyIds, isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { hasScheduleCapability, type ScheduleCapability } from "@/lib/capabilities/schedule";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { assertEmployeeTargetAccess } from "@/lib/hr/employee-auth";

export function assertScheduleCapability(
  ctx: HrApiAuthContext,
  cap: ScheduleCapability,
  message?: string,
): void {
  if (
    !hasEffectiveCapability(ctx.user, ctx.accessContext, cap, hasScheduleCapability(ctx.user, cap))
  ) {
    throw new HrApiError(message || `Capability '${cap}' diperlukan.`, 403);
  }
}

/** @deprecated Prefer assertScheduleCompanyScopeAsync — sync working scope is not FOM-aware. */
export function assertScheduleCompanyScope(ctx: HrApiAuthContext, companyId: string): void {
  assertCompanyInScope(companyId, getHrWorkingCompanyIds(ctx));
}

export async function assertScheduleCompanyScopeAsync(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId: string,
): Promise<void> {
  // FLEX-ORG-05-FIX — FOM inactive / empty ops = DENY (no working-company fallback).
  if (ctx.isOwner) {
    assertCompanyInScope(companyId, [companyId]);
    return;
  }
  const ops = await getHrOperationalCompanyIds(adminPb, ctx);
  if (ops.length === 0) {
    throw new HrApiError("Scope operasional HR kosong (fungsi tidak aktif atau tanpa entitas).", 403);
  }
  assertCompanyInScope(companyId, ops);
}

export function assertNotSelfScheduleAssignment(
  ctx: HrApiAuthContext,
  targetUserId: string,
): void {
  if (ctx.userId === targetUserId) {
    throw new HrApiError("Tidak dapat menetapkan jadwal untuk diri sendiri.", 403);
  }
}

export async function assertCanViewEmployeeSchedule(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
): Promise<void> {
  if (ctx.userId === targetUserId) return;

  assertScheduleCapability(ctx, "schedule.view");

  if (ctx.isOwner) return;

  if (isHrOperationalActor(ctx)) {
    const ops = await getHrOperationalCompanyIds(adminPb, ctx);
    if (ops.length === 0) {
      throw new HrApiError("Scope operasional HR kosong (fungsi tidak aktif atau tanpa entitas).", 403);
    }
    const subjectCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
    const overlap = subjectCompanies.some((id) => ops.includes(id));
    if (!overlap) {
      throw new HrApiError("Karyawan di luar scope entitas Anda.", 403);
    }
    return;
  }

  await assertEmployeeTargetAccess(adminPb, ctx, "employee.view_team", {
    userId: targetUserId,
  });
}

export async function assertCanAssignSchedule(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  targetUserId: string,
  companyId: string,
): Promise<void> {
  assertScheduleCapability(ctx, "schedule.assign");
  assertNotSelfScheduleAssignment(ctx, targetUserId);
  await assertScheduleCompanyScopeAsync(adminPb, ctx, companyId);

  if (!ctx.isOwner) {
    const ops = await getHrOperationalCompanyIds(adminPb, ctx);
    if (ops.length === 0) {
      throw new HrApiError("Scope operasional HR kosong (fungsi tidak aktif atau tanpa entitas).", 403);
    }
    const subjectCompanies = await getAccessibleCompanyIds(adminPb, targetUserId);
    const overlap = subjectCompanies.some((id) => ops.includes(id));
    if (!overlap) {
      throw new HrApiError("Karyawan di luar scope entitas Anda.", 403);
    }
  }
}

export function datesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null,
): boolean {
  const af = aFrom.slice(0, 10);
  const at = aTo ? aTo.slice(0, 10) : "9999-12-31";
  const bf = bFrom.slice(0, 10);
  const bt = bTo ? bTo.slice(0, 10) : "9999-12-31";
  return af <= bt && bf <= at;
}
