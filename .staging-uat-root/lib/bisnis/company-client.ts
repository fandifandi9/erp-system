import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import type { CompanyProfile } from "./types";

/** Semua entitas/perusahaan aktif. */
export async function fetchCompanyProfiles(activeOnly = true): Promise<CompanyProfile[]> {
  const filter = activeOnly ? "is_active = true" : "";
  return pb.collection(BISNIS_COLLECTIONS.companyProfile).getFullList<CompanyProfile>({
    sort: "company_name",
    filter: filter || undefined,
    requestKey: null,
  });
}

/** Satu entitas by id, atau entitas pertama aktif (fallback singleton). */
export async function fetchCompanyProfile(companyId?: string): Promise<CompanyProfile | null> {
  if (companyId) {
    try {
      return await pb.collection(BISNIS_COLLECTIONS.companyProfile).getOne<CompanyProfile>(companyId);
    } catch {
      return null;
    }
  }
  const list = await fetchCompanyProfiles(true);
  return list[0] ?? null;
}

export async function saveCompanyProfile(data: Partial<CompanyProfile>, existingId?: string) {
  if (existingId) {
    return pb.collection(BISNIS_COLLECTIONS.companyProfile).update<CompanyProfile>(existingId, data);
  }
  return pb.collection(BISNIS_COLLECTIONS.companyProfile).create<CompanyProfile>({
    is_active: true,
    ...data,
  });
}

/** Nonaktifkan entitas (soft delete) — data historis tetap ada. */
export async function deactivateCompanyProfile(id: string) {
  return setCompanyProfileActive(id, false);
}

/** Aktifkan kembali entitas yang pernah dinonaktifkan. */
export async function activateCompanyProfile(id: string) {
  return setCompanyProfileActive(id, true);
}

export async function setCompanyProfileActive(id: string, isActive: boolean) {
  return pb.collection(BISNIS_COLLECTIONS.companyProfile).update<CompanyProfile>(id, {
    is_active: isActive,
  });
}

/** @deprecated — gunakan deactivateCompanyProfile */
export async function deleteCompanyProfile(id: string) {
  return deactivateCompanyProfile(id);
}

export async function countActiveCompanyProfiles(exceptId?: string): Promise<number> {
  const list = await fetchCompanyProfiles(true);
  if (!exceptId) return list.length;
  return list.filter((c) => c.id !== exceptId).length;
}
