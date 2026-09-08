/**
 * Phase FLEX-ORG-02 — Management groups (normalized).
 * Management membership ≠ data access grant.
 */

import type PocketBase from "pocketbase";
import {
  MANAGEMENT_GROUP_ENTITIES_COLLECTION,
  MANAGEMENT_GROUPS_COLLECTION,
} from "@/lib/org/collections";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type ManagementGroupRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  notes?: string;
  entityIds: string[];
};

function mapGroup(
  row: Record<string, unknown>,
  entityIds: string[] = [],
): ManagementGroupRecord {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? "").trim(),
    name: String(row.name ?? "").trim(),
    isActive: row.is_active !== false,
    notes: String(row.notes ?? "").trim() || undefined,
    entityIds,
  };
}

async function collectionExists(adminPb: PocketBase, name: string): Promise<boolean> {
  try {
    await adminPb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

export async function listManagementGroups(
  adminPb: PocketBase,
): Promise<ManagementGroupRecord[]> {
  if (!(await collectionExists(adminPb, MANAGEMENT_GROUPS_COLLECTION))) return [];
  const rows = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).getFullList({
    sort: "name",
    requestKey: null,
  });
  const out: ManagementGroupRecord[] = [];
  for (const row of rows) {
    const id = String((row as { id: string }).id);
    const ents = await listEntityIdsForManagementGroup(adminPb, id);
    out.push(mapGroup(row as unknown as Record<string, unknown>, ents));
  }
  return out;
}

export async function listEntityIdsForManagementGroup(
  adminPb: PocketBase,
  managementGroupId: string,
): Promise<string[]> {
  const gid = managementGroupId.trim();
  if (!gid) return [];
  if (!(await collectionExists(adminPb, MANAGEMENT_GROUP_ENTITIES_COLLECTION))) return [];
  const rows = await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).getFullList({
    filter: `management_group = "${pbEscape(gid)}"`,
    requestKey: null,
  });
  return rows
    .map((r) => {
      const c = (r as Record<string, unknown>).company;
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object" && "id" in c) return String((c as { id: string }).id);
      return "";
    })
    .filter(Boolean);
}

export async function getManagementGroupForCompany(
  adminPb: PocketBase,
  companyId: string,
): Promise<ManagementGroupRecord | null> {
  const cid = companyId.trim();
  if (!cid) return null;
  if (!(await collectionExists(adminPb, MANAGEMENT_GROUP_ENTITIES_COLLECTION))) {
    // Compat: text field on biz_company_profile.management_group
    try {
      const company = (await adminPb.collection("biz_company_profile").getOne(cid, {
        requestKey: null,
      })) as Record<string, unknown>;
      const text = String(company.management_group ?? "").trim();
      if (!text) return null;
      // Prefer match by group id or code
      if (await collectionExists(adminPb, MANAGEMENT_GROUPS_COLLECTION)) {
        try {
          const byId = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).getOne(text, {
            requestKey: null,
          });
          const ents = await listEntityIdsForManagementGroup(adminPb, byId.id);
          return mapGroup(byId as unknown as Record<string, unknown>, ents);
        } catch {
          const found = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).getList(1, 1, {
            filter: `code = "${pbEscape(text)}" || name = "${pbEscape(text)}"`,
            requestKey: null,
          });
          if (found.items[0]) {
            const ents = await listEntityIdsForManagementGroup(adminPb, found.items[0].id);
            return mapGroup(found.items[0] as unknown as Record<string, unknown>, ents);
          }
        }
      }
      return {
        id: text,
        code: text,
        name: text,
        isActive: true,
        entityIds: [cid],
      };
    } catch {
      return null;
    }
  }

  const links = await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).getList(1, 1, {
    filter: `company = "${pbEscape(cid)}"`,
    requestKey: null,
  });
  if (!links.items[0]) return null;
  const gid =
    typeof (links.items[0] as Record<string, unknown>).management_group === "string"
      ? String((links.items[0] as Record<string, unknown>).management_group)
      : String(
          ((links.items[0] as Record<string, unknown>).management_group as { id?: string })?.id ??
            "",
        );
  if (!gid) return null;
  const group = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).getOne(gid, {
    requestKey: null,
  });
  const ents = await listEntityIdsForManagementGroup(adminPb, gid);
  return mapGroup(group as unknown as Record<string, unknown>, ents);
}

export async function createManagementGroup(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: { code: string; name: string; notes?: string; entityIds?: string[] },
): Promise<ManagementGroupRecord> {
  if (!ctx.isOwner) throw new HrApiError("Hanya Owner/Super Admin.", 403);
  if (!(await collectionExists(adminPb, MANAGEMENT_GROUPS_COLLECTION))) {
    throw new HrApiError("Koleksi management groups belum dimigrasi (local).", 503);
  }
  const code = String(input.code ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!code || !name) throw new HrApiError("Kode dan nama Manajemen wajib.", 400);

  const row = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).create(
    {
      code,
      name,
      is_active: true,
      notes: String(input.notes ?? "").trim(),
    },
    { requestKey: null },
  );

  const entityIds = [...new Set((input.entityIds ?? []).map((x) => String(x).trim()).filter(Boolean))];
  for (const companyId of entityIds) {
    await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).create(
      { management_group: row.id, company: companyId },
      { requestKey: null },
    );
    // Compat mirror text field
    try {
      await adminPb.collection("biz_company_profile").update(companyId, {
        operating_mode: "GROUP_MEMBER",
        management_group: row.id,
      });
    } catch {
      /* optional */
    }
  }

  return mapGroup(row as unknown as Record<string, unknown>, entityIds);
}

export async function setManagementGroupEntities(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  managementGroupId: string,
  entityIds: string[],
): Promise<ManagementGroupRecord> {
  if (!ctx.isOwner) throw new HrApiError("Hanya Owner/Super Admin.", 403);
  const gid = managementGroupId.trim();
  if (!gid) throw new HrApiError("Management group wajib.", 400);

  const existing = await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).getFullList({
    filter: `management_group = "${pbEscape(gid)}"`,
    requestKey: null,
  });
  for (const row of existing) {
    await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).delete(row.id, {
      requestKey: null,
    });
  }

  const next = [...new Set(entityIds.map((x) => String(x).trim()).filter(Boolean))];
  for (const companyId of next) {
    await adminPb.collection(MANAGEMENT_GROUP_ENTITIES_COLLECTION).create(
      { management_group: gid, company: companyId },
      { requestKey: null },
    );
    try {
      await adminPb.collection("biz_company_profile").update(companyId, {
        operating_mode: "GROUP_MEMBER",
        management_group: gid,
      });
    } catch {
      /* optional */
    }
  }

  const group = await adminPb.collection(MANAGEMENT_GROUPS_COLLECTION).getOne(gid, {
    requestKey: null,
  });
  return mapGroup(group as unknown as Record<string, unknown>, next);
}
