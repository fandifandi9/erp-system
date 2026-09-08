/**
 * Phase 34E — Resolve staff notification recipients by company membership.
 */

import type PocketBase from "pocketbase";
import { USER_COMPANIES_COLLECTION } from "@/lib/tenant/company-access";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function resolveStaffRecipientsForCompany(
  adminPb: PocketBase,
  companyId?: string,
): Promise<string[]> {
  if (!companyId?.trim()) {
    try {
      const users = await adminPb.collection("users").getFullList<{ id: string }>({
        filter: `status = "active"`,
        fields: "id",
        requestKey: null,
      });
      return users.map((u) => u.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const memberships = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{ user: string }>({
      filter: `company = "${pbEscape(companyId)}" && is_active != false`,
      fields: "user",
      requestKey: null,
    });
    return [...new Set(memberships.map((m) => m.user).filter(Boolean))];
  } catch {
    return [];
  }
}
