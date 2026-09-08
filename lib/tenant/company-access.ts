import type PocketBase from "pocketbase";
import { isOwnerAccount, isOwnerOrHrAccount } from "@/lib/auth-model";

export { isOwnerAccount };

export const USER_COMPANIES_COLLECTION = "biz_user_companies";

export type UserCompanyAccess = {
  id: string;
  user: string;
  company: string;
  is_active?: boolean;
  expand?: {
    company?: { id: string; company_name?: string; code?: string; is_active?: boolean };
    user?: { id: string; name?: string; email?: string };
  };
};

export type CompanyOption = {
  id: string;
  name: string;
  code?: string;
};

export function canManageCompanyAccess(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  return isOwnerOrHrAccount(user);
}

/** Daftar ID entitas yang boleh diakses user. Owner = semua entitas aktif. */
export async function listAccessibleCompanyIds(
  adminPb: PocketBase,
  userId: string,
  userRecord?: Record<string, unknown>,
): Promise<string[]> {
  let user = userRecord;
  if (!user) {
    user = (await adminPb.collection("users").getOne(userId)) as Record<string, unknown>;
  }

  if (isOwnerAccount(user)) {
    const all = await adminPb.collection("biz_company_profile").getFullList<{ id: string }>({
      filter: "is_active = true",
      sort: "company_name",
      requestKey: null,
    });
    return all.map((c) => c.id);
  }

  const rows = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<UserCompanyAccess>({
    filter: `user = "${userId}" && is_active != false`,
    fields: "company",
    requestKey: null,
  });

  const ids = [...new Set(rows.map((r) => r.company).filter(Boolean))];

  if (ids.length === 0) {
    const fallback =
      (user.active_company as string) ||
      (user.default_company as string) ||
      null;
    if (fallback) return [fallback];
  }

  return ids;
}

export async function listAccessibleCompanies(
  adminPb: PocketBase,
  userId: string,
  userRecord?: Record<string, unknown>,
): Promise<CompanyOption[]> {
  const ids = await listAccessibleCompanyIds(adminPb, userId, userRecord);
  if (ids.length === 0) return [];

  const filter = ids.map((id) => `id = "${id}"`).join(" || ");
  const companies = await adminPb.collection("biz_company_profile").getFullList<{
    id: string;
    company_name: string;
    code?: string;
    is_active?: boolean;
  }>({
    filter: `(${filter}) && is_active = true`,
    sort: "company_name",
    requestKey: null,
  });

  return companies.map((c) => ({
    id: c.id,
    name: c.company_name,
    code: c.code,
  }));
}

export async function assertUserCompanyAccess(
  adminPb: PocketBase,
  userId: string,
  companyId: string,
  userRecord?: Record<string, unknown>,
): Promise<void> {
  if (!companyId) throw new Error("Entitas wajib dipilih");
  const allowed = await listAccessibleCompanyIds(adminPb, userId, userRecord);
  if (!allowed.includes(companyId)) {
    throw new Error("Anda tidak memiliki akses ke entitas ini");
  }
}

/** Kelola akses entitas user (replace semua). */
export async function replaceUserCompanyAccess(
  adminPb: PocketBase,
  userId: string,
  companyIds: string[],
): Promise<void> {
  const unique = [...new Set(companyIds.filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("Minimal satu entitas harus dipilih");
  }

  const existing = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<UserCompanyAccess>({
    filter: `user = "${userId}"`,
    requestKey: null,
  });

  const existingByCompany = new Map(existing.map((r) => [r.company, r]));
  const targetSet = new Set(unique);

  for (const cid of unique) {
    const row = existingByCompany.get(cid);
    if (row) {
      if (row.is_active === false) {
        await adminPb.collection(USER_COMPANIES_COLLECTION).update(row.id, { is_active: true });
      }
    } else {
      await adminPb.collection(USER_COMPANIES_COLLECTION).create({
        user: userId,
        company: cid,
        is_active: true,
      });
    }
  }

  for (const row of existing) {
    if (!targetSet.has(row.company)) {
      await adminPb.collection(USER_COMPANIES_COLLECTION).delete(row.id);
    }
  }

  const user = (await adminPb.collection("users").getOne(userId)) as Record<string, unknown>;
  const active = (user.active_company as string) || (user.default_company as string);
  if (!active || !targetSet.has(active)) {
    const next = unique[0];
    await adminPb.collection("users").update(userId, {
      active_company: next,
      default_company: next,
    });
  }
}

export async function listAllUsersWithCompanyAccess(adminPb: PocketBase) {
  const [users, accessRows, companies] = await Promise.all([
    adminPb.collection("users").getFullList<{
      id: string;
      name?: string;
      email?: string;
      account_type?: string;
      role?: string;
      role_code?: string;
      status?: string;
    }>({
      sort: "name",
      requestKey: null,
    }),
    adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<UserCompanyAccess>({
      filter: "is_active != false",
      requestKey: null,
    }),
    adminPb.collection("biz_company_profile").getFullList<{
      id: string;
      company_name: string;
      code?: string;
      is_active?: boolean;
    }>({
      filter: "is_active = true",
      sort: "company_name",
      requestKey: null,
    }),
  ]);

  const byUser = new Map<string, string[]>();
  for (const row of accessRows) {
    const list = byUser.get(row.user) ?? [];
    list.push(row.company);
    byUser.set(row.user, list);
  }

  return {
    users: users.filter((u) => u.status !== "inactive"),
    companies: companies.map((c) => ({ id: c.id, name: c.company_name, code: c.code })),
    accessByUserId: Object.fromEntries(byUser),
  };
}
