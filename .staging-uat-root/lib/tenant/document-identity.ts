import { fetchCompanyProfile } from "@/lib/bisnis/company-client";
import { fetchStore } from "@/lib/bisnis/client";
import type { CompanyProfile, Store } from "@/lib/bisnis/types";
import type {
  DocumentIdentitySnapshot,
  NpwpDisplayMode,
  ResolvedNpwpSettings,
  StoreNpwpDisplay,
} from "./types";

export function resolveShowNpwp(
  company: CompanyProfile | null,
  store?: Pick<Store, "npwp_display"> | null,
): { show: boolean; mode: NpwpDisplayMode } {
  // Default tersembunyi — NPWP hanya tampil jika diaktifkan eksplisit di pengaturan.
  const companyShow = company?.show_npwp_on_documents === true;
  const mode = (company?.npwp_display_mode as NpwpDisplayMode) || "footer";
  const storeMode = (store?.npwp_display as StoreNpwpDisplay) || "inherit";
  if (storeMode === "show") return { show: true, mode };
  if (storeMode === "hide") return { show: false, mode };
  return { show: companyShow, mode };
}

export async function resolveNpwpSettings(storeId?: string): Promise<ResolvedNpwpSettings> {
  const store = storeId ? await fetchStore(storeId).catch(() => null) : null;
  const company = await fetchCompanyProfile(store?.company).catch(() => null);
  const { show, mode } = resolveShowNpwp(company, store);
  return { show, mode, company };
}

export async function buildDocumentIdentitySnapshot(storeId: string): Promise<DocumentIdentitySnapshot> {
  const [store, settings] = await Promise.all([fetchStore(storeId), resolveNpwpSettings(storeId)]);
  const company = settings.company;
  const legalName = company?.legal_name?.trim() || company?.company_name?.trim() || store.name;
  return {
    store_id: store.id,
    store_code: store.code,
    store_name: store.name,
    store_address: [store.address, store.city].filter(Boolean).join(", ") || undefined,
    store_phone: store.phone,
    store_email: store.email,
    store_bank_name: store.bank_name,
    store_bank_account:
      store.bank_account_number && store.bank_account_name
        ? `${store.bank_name || ""} ${store.bank_account_name} — ${store.bank_account_number}`.trim()
        : store.bank_account_number || store.bank_account_name,
    company_id: store.company,
    company_legal_name: legalName,
    company_npwp: company?.npwp,
    show_npwp: settings.show,
    npwp_display_mode: settings.mode,
    captured_at: new Date().toISOString(),
  };
}

export function parseIdentitySnapshot(raw?: string | null): DocumentIdentitySnapshot | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as DocumentIdentitySnapshot;
  } catch {
    return null;
  }
}

export function serializeIdentitySnapshot(snapshot: DocumentIdentitySnapshot): string {
  return JSON.stringify(snapshot);
}

/** Seller header dari snapshot atau store live. */
export function sellerFromIdentity(
  snapshot: DocumentIdentitySnapshot | null,
  store?: Store | null,
): { name: string; address?: string; phone?: string; email?: string } {
  if (snapshot) {
    return {
      name: snapshot.store_name,
      address: snapshot.store_address,
      phone: snapshot.store_phone,
      email: snapshot.store_email,
    };
  }
  return {
    name: store?.name || "—",
    address: [store?.address, store?.city].filter(Boolean).join(", ") || undefined,
    phone: store?.phone,
    email: store?.email,
  };
}

export function legalFooterFromIdentity(snapshot: DocumentIdentitySnapshot | null): string | undefined {
  if (!snapshot?.show_npwp) return undefined;
  const parts: string[] = [];
  if (snapshot.company_legal_name) parts.push(snapshot.company_legal_name);
  if (snapshot.company_npwp) parts.push(`NPWP: ${snapshot.company_npwp}`);
  return parts.length ? parts.join(" · ") : undefined;
}
