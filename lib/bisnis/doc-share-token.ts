import { randomBytes } from "crypto";
import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "./types";
import { docSharePublicPath, type DocShareKind } from "./doc-share";

export function generateDocShareToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return randomBytes(24).toString("hex");
}

const COLLECTION_BY_KIND: Record<DocShareKind, string> = {
  invoice: BISNIS_COLLECTIONS.invoices,
  sales_order: BISNIS_COLLECTIONS.salesOrders,
  quotation: BISNIS_COLLECTIONS.salesOrders,
  purchase_order: BISNIS_COLLECTIONS.purchaseOrders,
};

export async function ensureDocShareToken(
  kind: DocShareKind,
  recordId: string,
  adminPb?: PocketBase,
): Promise<string> {
  const collection = COLLECTION_BY_KIND[kind];
  const client = adminPb ?? pb;
  const rec = (await client.collection(collection).getOne(recordId, {
    fields: "id,share_token",
    requestKey: null,
  })) as { id: string; share_token?: string };

  if (rec.share_token?.trim()) return rec.share_token.trim();

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateDocShareToken();
    try {
      const updated = (await client.collection(collection).update(rec.id, {
        share_token: token,
      })) as { share_token?: string };
      return updated.share_token?.trim() ?? token;
    } catch {
      /* collision */
    }
  }
  throw new Error(`Gagal membuat token share untuk ${kind}.`);
}

export function docSharePublicUrlWithToken(
  kind: DocShareKind,
  id: string,
  token: string,
  origin?: string,
): string {
  const base = origin?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const path = docSharePublicPath(kind, id);
  const qs = `?token=${encodeURIComponent(token.trim())}`;
  return base ? `${base}${path}${qs}` : `${path}${qs}`;
}

export { ensureInvoiceShareToken, invoiceSharePublicUrl, invoiceShareTokenPath } from "./invoice-share-token";
