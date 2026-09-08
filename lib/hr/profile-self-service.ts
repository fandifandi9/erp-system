/**
 * lib/hr/profile-self-service.ts
 * Phase 32 — Self-service profile field allowlist (non-sensitive only).
 * Phase 34D — Extended DTO with employment read-only + primary entity.
 */

import type { PrimaryEntityDisplay } from "@/lib/hr/profile-primary-entity";
import { membershipSummary } from "@/lib/hr/profile-primary-entity";

/** Fields employees may update about themselves via /api/profile/self */
export const PROFILE_SELF_SERVICE_FIELDS = [
  "phone",
  "address",
  "date_of_birth",
  "bio",
] as const;

export type ProfileSelfServiceField = (typeof PROFILE_SELF_SERVICE_FIELDS)[number];

/** Fields that must NEVER be writable via self-service (server-enforced). */
export const PROFILE_RESTRICTED_FIELDS = [
  "nik",
  "npwp",
  "salary",
  "leave_daily_rate",
  "extra_bonus_amount",
  "extra_bonus_enabled",
  "late_deduction_rupiah_per_minute",
  "absence_deduction_rupiah_per_day",
  "manager",
  "user",
  "role",
  "role_code",
  "account_type",
  "dashboard_access",
  "inventory_role",
  "hr_role_preset",
  "status",
  "profile_status",
  "office_id",
  "position",
  "department",
  "division",
  "employee_code",
  "join_date",
  "shift_start",
  "shift_end",
  "shift_start_saturday",
  "shift_end_saturday",
  "shift_start_sunday",
  "shift_end_sunday",
  "late_tolerance",
  "require_checkin_selfie",
  "leave_bookings_quota",
  "company",
  "primary_entity_id",
] as const;

export type ProfileSelfServiceInput = Partial<
  Record<ProfileSelfServiceField, string | null | undefined>
>;

export type SelfProfileEmploymentDto = {
  division: string;
  department: string;
  position: string;
  salary: number | null;
  join_date: string;
  role_code: string | null;
  account_type: string;
  primary_entity: PrimaryEntityDisplay;
  membership_summary: string | null;
};

export type SelfProfileDto = {
  id: string;
  phone: string;
  address: string;
  date_of_birth: string;
  bio: string;
  avatar?: string;
  avatar_url: string | null;
  name: string;
  email: string;
  updated?: string;
  employment: SelfProfileEmploymentDto;
};

export function pickSelfServicePayload(
  body: Record<string, unknown> | null | undefined,
): ProfileSelfServiceInput {
  const out: ProfileSelfServiceInput = {};
  if (!body || typeof body !== "object") return out;

  for (const key of PROFILE_SELF_SERVICE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const v = body[key];
      if (v == null) {
        out[key] = "";
      } else {
        out[key] = String(v);
      }
    }
  }
  return out;
}

export function rejectRestrictedProfileFields(body: Record<string, unknown> | null | undefined): void {
  if (!body || typeof body !== "object") return;
  for (const key of PROFILE_RESTRICTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh diubah melalui profil mandiri.`);
    }
  }
  const privilegeKeys = [
    "account_type",
    "role",
    "role_code",
    "dashboard_access",
    "inventory_role",
    "status",
    "manager",
    "manager_user_id",
  ];
  for (const key of privilegeKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh diubah melalui profil mandiri.`);
    }
  }
}

export function buildSelfProfileDto(
  profile: Record<string, unknown>,
  user: Record<string, unknown>,
  primaryEntity: PrimaryEntityDisplay,
  avatarUrl: string | null,
): SelfProfileDto {
  const authAccountType = String(user.account_type ?? "user").toLowerCase();
  const roleCode =
    authAccountType === "owner"
      ? "owner"
      : String(user.role_code ?? user.role ?? "").toLowerCase() || null;

  const salaryRaw = profile.salary;
  const salary =
    typeof salaryRaw === "number"
      ? salaryRaw
      : salaryRaw != null && String(salaryRaw).trim() !== ""
        ? Number(salaryRaw)
        : null;

  return {
    id: String(profile.id),
    phone: String(profile.phone ?? ""),
    address: String(profile.address ?? ""),
    date_of_birth: profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : "",
    bio: String(profile.bio ?? ""),
    avatar: profile.avatar ? String(profile.avatar) : undefined,
    avatar_url: avatarUrl,
    name: String(profile.name ?? user.name ?? ""),
    email: String(profile.email ?? user.email ?? ""),
    updated: profile.updated ? String(profile.updated) : undefined,
    employment: {
      division: String(profile.division ?? "").trim(),
      department: String(profile.department ?? "").trim(),
      position: String(profile.position ?? "").trim(),
      salary: Number.isFinite(salary) ? salary : null,
      join_date: profile.join_date ? String(profile.join_date).slice(0, 10) : "",
      role_code: roleCode,
      account_type: authAccountType,
      primary_entity: primaryEntity,
      membership_summary: membershipSummary(primaryEntity),
    },
  };
}

/** @deprecated use buildSelfProfileDto — kept for backward compat in tests */
export function sanitizeSelfServiceRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: record.id,
    phone: record.phone ?? "",
    address: record.address ?? "",
    date_of_birth: record.date_of_birth ?? "",
    bio: record.bio ?? "",
    avatar: record.avatar,
    name: record.name,
    email: record.email,
    position: record.position,
    department: record.department,
    division: record.division,
    join_date: record.join_date,
  };
}
