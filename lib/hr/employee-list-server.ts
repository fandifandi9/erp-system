/**
 * Phase 35I-B0 / 35I-F3 — Server-authoritative HR employee list (entity-scoped).
 * Does not use client PocketBase profiles.listRule (legacy self || hr || owner).
 *
 * List company scope (see employee-list-scope.ts):
 * - Owner: semua entitas authorized, atau filter entitas tertentu (chooser Owner-only)
 * - Non-Owner + jabatan organisasi (mode configured): scope hierarki/assignment
 * - Non-Owner tanpa jabatan: HR working entity (HR FULL ≠ global visibility)
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertEmployeeCapability } from "@/lib/hr/employee-auth";
import { isHrOperationalActor } from "@/lib/access/hr-api-enforcement";
import {
  resolveEmployeeListCompanyScope,
  type EmployeeListScope,
} from "@/lib/hr/employee-list-scope";
import { listUserIdsInCompanies } from "@/lib/hr/employment-scope";
import {
  getMaxBookingsPerMonth,
  leaveBookingsQuotaFromProfileRecord,
} from "@/lib/leave";
import {
  inferEmployeeRolePresetId,
  isDashboardAccessEnabled,
  type EmployeeAccountFields,
} from "@/lib/hr/employee-role-presets";
import { isPrivilegedTargetUser } from "@/lib/capabilities/employee";
import { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } from "@/lib/hr/org-assignment-types";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function profileUserId(raw: { user?: unknown }): string | null {
  const u = raw.user;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (u && typeof u === "object" && "id" in u && typeof (u as { id: unknown }).id === "string") {
    return String((u as { id: string }).id).trim() || null;
  }
  return null;
}

function profileRequiresSelfie(raw: Record<string, unknown>): boolean {
  const v = raw.require_checkin_selfie;
  return v === true || String(v).toLowerCase() === "true" || Number(v) === 1;
}

export type EmployeeListItemDto = {
  id: string;
  userId: string;
  name: string;
  /** Org-structure position name (SSOT). Empty when no active assignment. */
  position: string;
  email: string;
  /** Kept for API compatibility; list UI shows posisi, not ERP role preset. */
  rolePresetId: string;
  dashboardAccess: boolean;
  status: string;
  leaveBookingsQuota: number;
  requireCheckinSelfie: boolean;
};

/**
 * Active org assignment → position name per user (prefer company in list scope).
 * Empty when the employee has no active jabatan in scope.
 */
async function fetchOrgPositionNamesByUser(
  adminPb: PocketBase,
  userIds: string[],
  companyIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueUsers = [...new Set(userIds.filter(Boolean))];
  const uniqueCompanies = [...new Set(companyIds.filter(Boolean))];
  if (uniqueUsers.length === 0 || uniqueCompanies.length === 0) return map;

  const companyFilter = uniqueCompanies.map((id) => `company="${pbEscape(id)}"`).join(" || ");
  const chunkSize = 25;
  for (let i = 0; i < uniqueUsers.length; i += chunkSize) {
    const chunk = uniqueUsers.slice(i, i + chunkSize);
    const userFilter = chunk.map((id) => `user="${pbEscape(id)}"`).join(" || ");
    const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
      filter: `is_active = true && (${userFilter}) && (${companyFilter})`,
      sort: "company",
      expand: "org_position",
      requestKey: null,
    });
    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      const uid =
        typeof r.user === "string"
          ? r.user.trim()
          : r.user && typeof r.user === "object" && "id" in r.user
            ? String((r.user as { id: unknown }).id ?? "").trim()
            : "";
      if (!uid || map.has(uid)) continue;
      const expand = r.expand as { org_position?: { name?: unknown } } | undefined;
      const name = String(expand?.org_position?.name ?? "").trim();
      if (name) map.set(uid, name);
    }
  }
  return map;
}

async function fetchUsersByIds(
  adminPb: PocketBase,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids.filter(Boolean))];
  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const filter = chunk.map((id) => `id="${pbEscape(id)}"`).join(" || ");
    const rows = await adminPb.collection("users").getFullList({
      filter: `(${filter})`,
      fields: "id,email,name,role,role_code,account_type,inventory_role,hr_role_preset,dashboard_access,status",
      requestKey: null,
    });
    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      if (r.id) map.set(String(r.id), r);
    }
  }
  return map;
}

async function fetchLatestProfilesForUsers(
  adminPb: PocketBase,
  userIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const latestByUser = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(userIds.filter(Boolean))];
  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const filter = chunk.map((id) => `user="${pbEscape(id)}"`).join(" || ");
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `(${filter})`,
      sort: "-updated",
      requestKey: null,
    });
    for (const row of rows) {
      const profile = row as unknown as Record<string, unknown>;
      const uid = profileUserId(profile as { user?: unknown });
      if (!uid) continue;
      const existing = latestByUser.get(uid);
      if (!existing) {
        latestByUser.set(uid, profile);
        continue;
      }
      const tNew = new Date(String(profile.updated || profile.created || 0)).getTime();
      const tOld = new Date(String(existing.updated || existing.created || 0)).getTime();
      if (tNew >= tOld) latestByUser.set(uid, profile);
    }
  }
  return latestByUser;
}

/**
 * List employees in resolved list scope (Owner all/filter, org hierarchy, or working entity).
 * Employment relation = active `biz_user_companies` for the employee user.
 * Phase 35I-C: Staff/operational HR list hides privileged targets (Owner / legacy role_code=hr);
 * Owner list retains privileged accounts. Mutation protection unchanged.
 */
export async function serverListEmployeesForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  options?: { companyId?: string | null },
): Promise<{ items: EmployeeListItemDto[]; scope: EmployeeListScope }> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses HR ditolak.", 403);
  }
  assertEmployeeCapability(ctx, "employee.view");

  const scope = await resolveEmployeeListCompanyScope(adminPb, ctx, options);
  const effectiveCompanyIds = scope.companyIds;

  if (effectiveCompanyIds.length === 0) {
    throw new HrApiError("Scope entitas HR untuk daftar karyawan tidak dapat ditentukan.", 403);
  }

  const scopedUserIds = await listUserIdsInCompanies(adminPb, effectiveCompanyIds);
  if (scopedUserIds.length === 0) {
    return { items: [], scope };
  }

  const profilesByUser = await fetchLatestProfilesForUsers(adminPb, scopedUserIds);
  const profileUserIds = [...profilesByUser.keys()];
  const usersById = await fetchUsersByIds(adminPb, profileUserIds);
  const orgPositionByUser = await fetchOrgPositionNamesByUser(
    adminPb,
    profileUserIds,
    effectiveCompanyIds,
  );
  const defaultQuota = getMaxBookingsPerMonth();
  /** Owner retains privileged visibility; operational Staff+HR (and legacy HR actors) do not. */
  const hidePrivilegedTargets = !ctx.isOwner;

  const items: EmployeeListItemDto[] = [];
  for (const uid of profileUserIds) {
    const profile = profilesByUser.get(uid);
    if (!profile) continue;
    const u = usersById.get(uid);
    if (hidePrivilegedTargets && isPrivilegedTargetUser(u ?? null)) {
      continue;
    }
    const account = (u || {}) as EmployeeAccountFields;
    const emailFromProfile = String(profile.email ?? "").trim();
    const emailFromUser = String(u?.email ?? "").trim();

    items.push({
      id: String(profile.id ?? ""),
      userId: uid,
      name: String(profile.name || u?.name || "").trim() || "-",
      position: orgPositionByUser.get(uid) ?? "",
      email: emailFromProfile || emailFromUser || "-",
      rolePresetId: inferEmployeeRolePresetId(account),
      dashboardAccess: isDashboardAccessEnabled(account),
      status: String(u?.status ?? profile.status ?? "inactive").trim() || "inactive",
      leaveBookingsQuota: leaveBookingsQuotaFromProfileRecord(profile) ?? defaultQuota,
      requireCheckinSelfie: profileRequiresSelfie(profile),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "id"));
  return { items, scope };
}
