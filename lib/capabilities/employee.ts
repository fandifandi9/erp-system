/**
 * lib/capabilities/employee.ts
 * Phase 31 — Employee / account capability registry (shared web + server).
 *
 * SECURITY: UI may use these for visibility; API routes MUST enforce via
 * assertEmployeeCapability() in lib/hr/employee-auth.ts.
 */

import {
  isHrAccount,
  isOwnerAccount,
  normalizeAuthModel,
  type AuthUserShape,
  type UserRoleCode,
} from "@/lib/auth-model";

export const EMPLOYEE_CAPABILITIES = [
  "employee.view",
  "employee.create",
  "employee.update",
  "employee.activate",
  "employee.deactivate",
  "employee.view_sensitive",
  "employee.manage_accounts",
  "employee.manage_hr_accounts",
  "employee.assign_manager",
  "employee.view_team",
] as const;

export type EmployeeCapability = (typeof EMPLOYEE_CAPABILITIES)[number];

export type EmployeeDataScope = "OWN" | "MANAGED_EMPLOYEES" | "COMPANY";

export type EmployeeCapabilityMeta = {
  label: string;
  defaultScope: EmployeeDataScope;
  /** Roles that receive this capability by default (code registry — not PB table). */
  grantedTo: Array<"owner" | UserRoleCode>;
};

export const EMPLOYEE_CAPABILITY_DEFS: Record<EmployeeCapability, EmployeeCapabilityMeta> = {
  "employee.view": {
    label: "Lihat data karyawan",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.create": {
    label: "Buat karyawan baru",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.update": {
    label: "Ubah data karyawan",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.activate": {
    label: "Aktifkan akun karyawan",
    defaultScope: "COMPANY",
    grantedTo: ["owner"],
  },
  "employee.deactivate": {
    label: "Nonaktifkan akun karyawan",
    defaultScope: "COMPANY",
    grantedTo: ["owner"],
  },
  "employee.view_sensitive": {
    label: "Lihat data sensitif karyawan",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.manage_accounts": {
    label: "Kelola akun karyawan (role non-privileged)",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.manage_hr_accounts": {
    label: "Kelola akun HR / privileged",
    defaultScope: "COMPANY",
    grantedTo: ["owner"],
  },
  "employee.assign_manager": {
    label: "Tetapkan atasan langsung",
    defaultScope: "COMPANY",
    grantedTo: ["owner", "hr"],
  },
  "employee.view_team": {
    label: "Lihat tim yang dikelola",
    defaultScope: "MANAGED_EMPLOYEES",
    grantedTo: ["owner", "manager", "hr"],
  },
};

/** Fields considered sensitive — never returned without employee.view_sensitive. */
export const SENSITIVE_PROFILE_FIELDS = [
  "nik",
  "npwp",
  "salary",
  "leave_daily_rate",
  "extra_bonus_amount",
  "extra_bonus_enabled",
  "late_deduction_rupiah_per_minute",
  "absence_deduction_rupiah_per_day",
] as const;

export type SensitiveProfileField = (typeof SENSITIVE_PROFILE_FIELDS)[number];

export function isPrivilegedTargetUser(target: AuthUserShape | null | undefined): boolean {
  if (!target) return true;
  const auth = normalizeAuthModel(target);
  if (auth.accountType === "owner") return true;
  if (auth.roleCode === "hr") return true;
  return false;
}

/**
 * Resolve employee capabilities for an actor.
 * FAIL CLOSED: null user → empty set.
 */
export function resolveEmployeeCapabilities(
  actor: AuthUserShape | null | undefined,
): Set<EmployeeCapability> {
  const caps = new Set<EmployeeCapability>();
  if (!actor) return caps;

  if (isOwnerAccount(actor)) {
    for (const c of EMPLOYEE_CAPABILITIES) caps.add(c);
    return caps;
  }

  const auth = normalizeAuthModel(actor);
  const role = auth.roleCode;

  for (const [cap, meta] of Object.entries(EMPLOYEE_CAPABILITY_DEFS) as [
    EmployeeCapability,
    EmployeeCapabilityMeta,
  ][]) {
    if (role && meta.grantedTo.includes(role)) {
      caps.add(cap);
    }
  }

  // HR without manage_hr_accounts: still has view/update but server blocks privileged targets.
  if (isHrAccount(actor)) {
    caps.delete("employee.manage_hr_accounts");
    caps.delete("employee.activate");
    caps.delete("employee.deactivate");
  }

  return caps;
}

export function hasEmployeeCapability(
  actor: AuthUserShape | null | undefined,
  cap: EmployeeCapability,
): boolean {
  return resolveEmployeeCapabilities(actor).has(cap);
}

export function getEmployeeCapabilityScope(
  actor: AuthUserShape | null | undefined,
  cap: EmployeeCapability,
): EmployeeDataScope | null {
  if (!hasEmployeeCapability(actor, cap)) return null;
  return EMPLOYEE_CAPABILITY_DEFS[cap].defaultScope;
}
