import type { Invoice } from "@/lib/bisnis/types";
import {
  buildDocumentIdentitySnapshot,
  serializeIdentitySnapshot,
} from "./document-identity";

export async function enrichInvoiceWithStore(
  data: Partial<Invoice>,
  storeId: string,
): Promise<Partial<Invoice>> {
  const snapshot = await buildDocumentIdentitySnapshot(storeId);
  return {
    ...data,
    store: storeId,
    company: snapshot.company_id || data.company,
    identity_snapshot_json: serializeIdentitySnapshot(snapshot),
  };
}
