/**
 * lib/hr/manager-hierarchy.ts
 * Phase 32 — Manager assignment validation (circular hierarchy prevention).
 */

import type PocketBase from "pocketbase";
import { HrApiError } from "@/lib/hr/api-auth";
import { PROFILE_MANAGER_FIELD } from "@/lib/hr/employee-scope";
import { listUserIdsInCompanies } from "@/lib/hr/employment-scope";
import { isOwnerAccount, normalizeAuthModel } from "@/lib/auth-model";

export type ManagerCandidate = {
  userId: string;
  name: string;
  email: string;
  roleCode: string | null;
  accountType: string;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function getManagerUserIdForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<string | null> {
  try {
    const rows = await adminPb.collection("profiles").getFullList({
      filter: `user = "${pbEscape(userId)}"`,
      sort: "-updated",
      fields: `id,${PROFILE_MANAGER_FIELD}`,
    });
    if (rows.length === 0) return null;
    const mgr = (rows[0] as Record<string, unknown>)[PROFILE_MANAGER_FIELD];
    if (typeof mgr === "string" && mgr) return mgr;
    if (mgr && typeof mgr === "object" && "id" in mgr) {
      return String((mgr as { id: string }).id);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reject assignment if `newManagerId` is the employee or creates a cycle upward.
 */
export async function assertNoCircularManagerAssignment(
  adminPb: PocketBase,
  employeeUserId: string,
  newManagerId: string | null | undefined,
): Promise<void> {
  if (!newManagerId) return;
  if (newManagerId === employeeUserId) {
    throw new HrApiError("Karyawan tidak dapat menjadi atasan dirinya sendiri.", 400);
  }

  let current: string | null = newManagerId;
  const visited = new Set<string>();
  let depth = 0;
  const MAX_DEPTH = 32;

  while (current && depth < MAX_DEPTH) {
    if (current === employeeUserId) {
      throw new HrApiError(
        "Penetapan atasan ditolak: akan membuat hierarki melingkar.",
        400,
      );
    }
    if (visited.has(current)) break;
    visited.add(current);
    current = await getManagerUserIdForUser(adminPb, current);
    depth += 1;
  }
}

/** Valid manager candidates: active users in company scope (manager optional). */
export async function listManagerCandidates(
  adminPb: PocketBase,
  options: {
    excludeUserId?: string;
    companyIds?: string[] | null;
    /** Users with an active org seat elsewhere are excluded (no merangkap jabatan). */
    excludeActiveOrgHolders?: boolean;
    /** Keep this position's current holder in the list (for Ganti pemegang). */
    allowHolderOfPositionId?: string | null;
  } = {},
): Promise<ManagerCandidate[]> {
  let scopedUserIds: Set<string> | null = null;
  if (options.companyIds && options.companyIds.length > 0) {
    scopedUserIds = new Set(await listUserIdsInCompanies(adminPb, options.companyIds));
  }

  const occupiedElseWhere = new Set<string>();
  if (options.excludeActiveOrgHolders) {
    try {
      const { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } = await import(
        "@/lib/hr/org-assignment-types"
      );
      const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList<{
        user: string;
        org_position: string;
        is_active?: boolean;
      }>({
        filter: "is_active = true",
        fields: "user,org_position,is_active",
        requestKey: null,
      });
      const allowPos = String(options.allowHolderOfPositionId || "").trim();
      for (const r of rows) {
        const uid = typeof r.user === "string" ? r.user : "";
        const pos =
          typeof r.org_position === "string"
            ? r.org_position
            : String((r.org_position as { id?: string } | undefined)?.id || "");
        if (!uid) continue;
        if (allowPos && pos === allowPos) continue;
        occupiedElseWhere.add(uid);
      }
    } catch {
      /* collection may be missing */
    }
  }

  const filter = `status != "inactive"`;
  const rows = await adminPb.collection("users").getFullList({
    filter,
    sort: "name",
    fields: "id,name,email,role_code,account_type,status",
  });

  let candidates = rows
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const auth = normalizeAuthModel(rec);
      return {
        userId: String(rec.id),
        name: String(rec.name || rec.email || rec.id),
        email: String(rec.email || ""),
        roleCode: auth.roleCode,
        accountType: auth.accountType,
      };
    })
    .filter((c) => {
      // Owner is system authority — not an org-seat / atasan candidate.
      if (isOwnerAccount({ account_type: c.accountType })) return false;
      if (options.excludeUserId && c.userId === options.excludeUserId) return false;
      if (scopedUserIds && !scopedUserIds.has(c.userId)) return false;
      if (occupiedElseWhere.has(c.userId)) return false;
      return true;
    });

  const roleRank = (c: ManagerCandidate) => {
    if (c.roleCode === "hr") return 1;
    if (c.roleCode === "manager") return 2;
    return 3;
  };
  candidates.sort((a, b) => roleRank(a) - roleRank(b) || a.name.localeCompare(b.name));

  return candidates;
}
