import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { CompanyProfile, Store } from "@/lib/bisnis/types";
import {
  resolveShowNpwp,
  serializeIdentitySnapshot,
} from "./document-identity";
import type { DocumentIdentitySnapshot } from "./types";
import type { Invoice } from "@/lib/bisnis/types";

export async function buildDocumentIdentitySnapshotServer(
  pocket: PocketBase,
  storeId: string,
): Promise<DocumentIdentitySnapshot> {
  const store = await pocket.collection(BISNIS_COLLECTIONS.stores).getOne<Store>(storeId);
  let company: CompanyProfile | null = null;
  if (store.company) {
    company = await pocket
      .collection(BISNIS_COLLECTIONS.companyProfile)
      .getOne<CompanyProfile>(store.company)
      .catch(() => null);
  }
  if (!company) {
    try {
      const list = await pocket.collection(BISNIS_COLLECTIONS.companyProfile).getList<CompanyProfile>(1, 1, {
        sort: "-updated",
        filter: "is_active = true",
      });
      company = list.items[0] ?? null;
    } catch {
      /* optional */
    }
  }
  const { show, mode } = resolveShowNpwp(company, store);
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
    company_id: company?.id,
    company_legal_name: legalName,
    company_npwp: company?.npwp,
    show_npwp: show,
    npwp_display_mode: mode,
    captured_at: new Date().toISOString(),
  };
}

export async function enrichInvoiceWithStoreServer(
  pocket: PocketBase,
  data: Partial<Invoice>,
  storeId: string,
): Promise<Partial<Invoice>> {
  const snapshot = await buildDocumentIdentitySnapshotServer(pocket, storeId);
  return {
    ...data,
    store: storeId,
    company: snapshot.company_id || data.company,
    identity_snapshot_json: serializeIdentitySnapshot(snapshot),
  };
}
