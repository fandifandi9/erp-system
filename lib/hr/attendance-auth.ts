/**
 * Phase 34B — Server-side attendance capability enforcement.
 * Phase 35I-A — Additive module assignment capability checks.
 */
import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import { HrApiError } from "@/lib/hr/api-auth";
import { hasEffectiveCapability } from "@/lib/access/effective-capability";
import {
  hasAttendanceCapability,
  type AttendanceCapability,
} from "@/lib/capabilities/attendance";

/** Legacy role capability OR module-granted attendance capability. */
export function hasEffectiveAttendanceCapability(
  ctx: HrApiAuthContext,
  cap: AttendanceCapability,
): boolean {
  return hasEffectiveCapability(
    ctx.user,
    ctx.accessContext,
    cap,
    hasAttendanceCapability(ctx.user, cap),
  );
}

export function assertAttendanceCapability(
  ctx: HrApiAuthContext,
  cap: AttendanceCapability,
  message?: string,
): void {
  if (!hasEffectiveAttendanceCapability(ctx, cap)) {
    throw new HrApiError(message || "Tidak berwenang untuk operasi absensi ini.", 403);
  }
}
