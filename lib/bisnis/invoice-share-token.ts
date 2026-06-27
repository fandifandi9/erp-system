import { randomBytes } from "crypto";
import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Invoice } from "./types";

export function generateInvoiceShareToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return randomBytes(24).toString("hex");
}

export function invoiceShareTokenPath(token: string): string {
  return `/share/i/${encodeURIComponent(token.trim())}`;
}

export function invoiceSharePublicUrl(token: string, origin?: string): string {
  const path = invoiceShareTokenPath(token);
  if (origin?.trim()) return `${origin.replace(/\/$/, "")}${path}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export async function ensureInvoiceShareToken(
  invoiceId: string,
  adminPb?: PocketBase,
): Promise<string> {
  const client = adminPb ?? pb;
  const inv = await client.collection(BISNIS_COLLECTIONS.invoices).getOne<Invoice>(invoiceId, {
    fields: "id,share_token",
    requestKey: null,
  });
  if (inv.share_token?.trim()) return inv.share_token.trim();

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateInvoiceShareToken();
    try {
      const updated = await client.collection(BISNIS_COLLECTIONS.invoices).update<Invoice>(inv.id, {
        share_token: token,
      });
      return updated.share_token?.trim() ?? token;
    } catch {
      /* collision — coba lagi */
    }
  }
  throw new Error("Gagal membuat token share invoice.");
}

export async function fetchInvoiceByShareToken(
  token: string,
  adminPb: PocketBase,
): Promise<Invoice> {
  const esc = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return adminPb.collection(BISNIS_COLLECTIONS.invoices).getFirstListItem<Invoice>(
    `share_token = "${esc}"`,
    { expand: "customer,sales_order", requestKey: null },
  );
}
