import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import type { CompanyProfile } from "./types";

function companyApiHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

async function parseCompanyApiResponse(res: Response): Promise<CompanyProfile> {
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: CompanyProfile;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  if (!json.data?.id) throw new Error("Respons entitas tidak valid.");
  return json.data;
}

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

/** Buat / ubah entitas via server API (Owner) — PB client createRule local sering admin-only. */
export async function saveCompanyProfile(data: Partial<CompanyProfile>, existingId?: string) {
  if (existingId) {
    const res = await fetch(`/api/master-data/legal-entities/${encodeURIComponent(existingId)}`, {
      method: "PATCH",
      headers: companyApiHeaders(),
      body: JSON.stringify(data),
    });
    return parseCompanyApiResponse(res);
  }
  const res = await fetch("/api/master-data/legal-entities", {
    method: "POST",
    headers: companyApiHeaders(),
    body: JSON.stringify({ is_active: true, ...data }),
  });
  return parseCompanyApiResponse(res);
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
  const res = await fetch(`/api/master-data/legal-entities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: companyApiHeaders(),
    body: JSON.stringify({ is_active: isActive }),
  });
  return parseCompanyApiResponse(res);
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
