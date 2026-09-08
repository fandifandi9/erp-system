/**
 * lib/capabilities/attendance.ts
 * Phase 34B — Attendance capability registry (web + mobile + server).
 */

import {
  isHrAccount,
  isOwnerAccount,
  normalizeAuthModel,
  type AuthUserShape,
  type UserRoleCode,
} from "@/lib/auth-model";

export const ATTENDANCE_CAPABILITIES = [
  "attendance.view_self",
  "attendance.check_in",
  "attendance.check_out",
  "attendance.view_team",
  "attendance.manage",
] as const;

export type AttendanceCapability = (typeof ATTENDANCE_CAPABILITIES)[number];

export type AttendanceDataScope = "OWN" | "MANAGED_EMPLOYEES" | "COMPANY";

export type AttendanceCapabilityMeta = {
  label: string;
  defaultScope: AttendanceDataScope;
  grantedTo: Array<"owner" | UserRoleCode>;
};

export const ATTENDANCE_CAPABILITY_DEFS: Record<AttendanceCapability, AttendanceCapabilityMeta> = {
  "attendance.view_self": {
    label: "Lihat absensi sendiri",
    defaultScope: "OWN",
    grantedTo: ["owner", "hr", "manager", "staff", "staff-basic", "security", "ob"],
  },
  "attendance.check_in": {
    label: "Check-in absensi",
    defaultScope: "OWN",
    grantedTo: ["owner", "hr", "manager", "staff", "staff-basic", "security", "ob"],
  },
  "attendance.check_out": {
    label: "Check-out absensi",
    defaultScope: "OWN",
    grantedTo: ["owner", "hr", "manager", "staff", "staff-basic", "security", "ob"],
  },
  "attendance.view_team": {
    label: "Lihat absensi tim",
    defaultScope: "MANAGED_EMPLOYEES",
    grantedTo: ["owner", "hr", "manager"],
  },
  "attendance.manage": {
    label: "Kelola & koreksi absensi (HR)",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
};

export function resolveAttendanceCapabilities(
  actor: AuthUserShape | null | undefined,
): Set<AttendanceCapability> {
  const caps = new Set<AttendanceCapability>();
  if (!actor) return caps;

  if (isOwnerAccount(actor)) {
    for (const c of ATTENDANCE_CAPABILITIES) caps.add(c);
    return caps;
  }

  const auth = normalizeAuthModel(actor);
  const role = auth.roleCode;
  for (const [cap, meta] of Object.entries(ATTENDANCE_CAPABILITY_DEFS) as [
    AttendanceCapability,
    AttendanceCapabilityMeta,
  ][]) {
    if (role && meta.grantedTo.includes(role)) caps.add(cap);
  }

  return caps;
}

export function hasAttendanceCapability(
  actor: AuthUserShape | null | undefined,
  cap: AttendanceCapability,
): boolean {
  return resolveAttendanceCapabilities(actor).has(cap);
}

export function getAttendanceCapabilityScope(
  actor: AuthUserShape | null | undefined,
  cap: AttendanceCapability,
): AttendanceDataScope | null {
  if (!hasAttendanceCapability(actor, cap)) return null;
  return ATTENDANCE_CAPABILITY_DEFS[cap].defaultScope;
}

/** Legacy mobile alias — maps to view_self */
export function hasLegacyAttendanceView(
  actor: AuthUserShape | null | undefined,
): boolean {
  return hasAttendanceCapability(actor, "attendance.view_self");
}
