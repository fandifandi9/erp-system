/**
 * Phase 34E — Entity snapshot on payroll_items at period lock/approval.
 * Canonical: biz_user_companies.is_primary → biz_company_profile
 */

import type PocketBase from "pocketbase";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

export type PayrollEntitySnapshot = {
  company_id?: string;
  company_name_snapshot: string;
  company_legal_name_snapshot?: string;
  company_code_snapshot?: string;
  entity_type_snapshot?: string;
  company_address_snapshot?: string;
  company_npwp_snapshot?: string;
  company_logo_snapshot?: string;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function resolvePayrollEntitySnapshotForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<PayrollEntitySnapshot> {
  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, userId);
  if (primary.status !== "resolved" || !primary.company_id) {
    return {
      company_name_snapshot: primary.label || "Belum ditentukan",
      company_code_snapshot: primary.code,
      entity_type_snapshot: primary.entity_type,
    };
  }

  let address = "";
  let npwp = "";
  try {
    const company = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(primary.company_id, {
      fields: "id,company_name,legal_name,display_name,code,entity_type,address,city,npwp,logo,updated",
      requestKey: null,
    })) as Record<string, unknown>;
    const addr = String(company.address ?? "").trim();
    const city = String(company.city ?? "").trim();
    address = [addr, city].filter(Boolean).join(", ");
    npwp = String(company.npwp ?? "").trim();
    const logo = String(company.logo ?? "").trim();
    const legalName = String(company.legal_name ?? "").trim();
    const displayName = String(company.display_name ?? "").trim();
    return {
      company_id: primary.company_id,
      company_name_snapshot: displayName || primary.company_name || primary.label,
      company_legal_name_snapshot: legalName || displayName || primary.company_name || primary.label,
      company_code_snapshot: primary.code,
      entity_type_snapshot: primary.entity_type,
      company_address_snapshot: address || undefined,
      company_npwp_snapshot: npwp || undefined,
      company_logo_snapshot: logo || undefined,
    };
  } catch {
    // use primary display only
  }

  return {
    company_id: primary.company_id,
    company_name_snapshot: primary.company_name || primary.label,
    company_code_snapshot: primary.code,
    entity_type_snapshot: primary.entity_type,
    company_address_snapshot: address || undefined,
    company_npwp_snapshot: npwp || undefined,
  };
}

export async function stampPayrollItemEntitySnapshot(
  adminPb: PocketBase,
  payrollItemId: string,
  userId: string,
  force = false,
): Promise<void> {
  const item = (await adminPb.collection("payroll_items").getOne(payrollItemId, {
    requestKey: null,
  })) as Record<string, unknown>;

  if (!force && String(item.company_name_snapshot ?? "").trim() && String(item.company_logo_snapshot ?? "").trim()) {
    return;
  }

  const snapshot = await resolvePayrollEntitySnapshotForUser(adminPb, userId);
  const profileId = String(item.profile ?? "");
  let employeeCode = "";
  let department = String(item.department_snapshot ?? item.division ?? "").trim();

  if (profileId) {
    try {
      const profile = (await adminPb.collection("profiles").getOne(profileId, {
        fields: "employee_code,department,division,nik",
        requestKey: null,
      })) as Record<string, unknown>;
      employeeCode = String(profile.employee_code ?? profile.nik ?? "").trim();
      if (!department) {
        department = String(profile.department ?? profile.division ?? "").trim();
      }
    } catch {
      // optional
    }
  }

  await adminPb.collection("payroll_items").update(
    payrollItemId,
    {
      company_id: snapshot.company_id || undefined,
      company_name_snapshot: snapshot.company_name_snapshot,
      company_legal_name_snapshot: snapshot.company_legal_name_snapshot || undefined,
      company_code_snapshot: snapshot.company_code_snapshot || undefined,
      entity_type_snapshot: snapshot.entity_type_snapshot || undefined,
      company_address_snapshot: snapshot.company_address_snapshot || undefined,
      company_npwp_snapshot: snapshot.company_npwp_snapshot || undefined,
      company_logo_snapshot: snapshot.company_logo_snapshot || undefined,
      department_snapshot: department || undefined,
      employee_code_snapshot: employeeCode || undefined,
    },
    { requestKey: null },
  );
}

export async function stampAllPayrollItemsInPeriod(
  adminPb: PocketBase,
  periodId: string,
  force = false,
): Promise<number> {
  const items = await adminPb.collection("payroll_items").getFullList<{ id: string; user: string }>({
    filter: `period = "${pbEscape(periodId)}"`,
    fields: "id,user",
    requestKey: null,
  });
  let count = 0;
  for (const item of items) {
    await stampPayrollItemEntitySnapshot(adminPb, item.id, item.user, force);
    count++;
  }
  return count;
}
