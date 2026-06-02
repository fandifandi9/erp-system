import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { MpProductMapping, StoreChannelAccount } from "./types";
import type { ParsedImportRow } from "./mp-import-parse";
import type { LineInput } from "./mp-fee-engine";

export type ProductSkuIndexEntry = {
  id: string;
  sku: string;
  category?: string;
};

/** Trim; perbandingan case-insensitive memakai skuKey(). */
export function normalizeSku(s: string): string {
  return s.trim();
}

export function skuKey(s: string): string {
  return normalizeSku(s).toLowerCase();
}

export type ResolvedProduct = {
  productId: string;
  internalCategoryId?: string;
  serbaSku: string;
  source: "serba_sku" | "mapping";
};

const SKU_NOT_FOUND_HINT =
  "Pastikan kolom mp_sku di Excel sama dengan Kode produk/SKU di master produk SERBA (seragam di Shopee, Tokopedia, BliBli, dll.).";

/** Index semua produk aktif: lookup cepat saat import massal. */
export async function buildProductSkuIndex(): Promise<Map<string, ProductSkuIndexEntry>> {
  const map = new Map<string, ProductSkuIndexEntry>();
  try {
    const products = await pb.collection(INV_COLLECTIONS.products).getFullList<ProductSkuIndexEntry>({
      filter: "is_active = true",
      fields: "id,sku,category",
      requestKey: null,
    });
    for (const p of products) {
      if (!p.sku?.trim()) continue;
      map.set(skuKey(p.sku), { id: p.id, sku: normalizeSku(p.sku), category: p.category });
    }
  } catch {
  }
  return map;
}

/**
 * Kunci produk & kategori internal dari SKU.
 * 1) SKU master SERBA (prioritas — harus seragam di semua MP)
 * 2) Mapping alias (hanya jika SKU di MP memang berbeda)
 */
export function resolveProductBySku(
  mpSku: string,
  account: StoreChannelAccount,
  mappings: MpProductMapping[],
  productBySku: Map<string, ProductSkuIndexEntry>,
): { resolved?: ResolvedProduct; error?: string } {
  const raw = normalizeSku(mpSku);
  if (!raw) return { error: "SKU kosong di baris import" };

  const fromSerba = productBySku.get(skuKey(raw));
  if (fromSerba) {
    return {
      resolved: {
        productId: fromSerba.id,
        internalCategoryId: fromSerba.category,
        serbaSku: fromSerba.sku,
        source: "serba_sku",
      },
    };
  }

  const map = mappings.find(
    (m) =>
      m.is_active &&
      skuKey(m.mp_sku) === skuKey(raw) &&
      (!m.store_channel_account || m.store_channel_account === account.id) &&
      (!m.channel || m.channel === account.channel),
  );
  if (map?.product) {
    const expanded = map.expand?.product;
    if (expanded?.sku) {
      const hit = productBySku.get(skuKey(expanded.sku));
      if (hit) {
        return {
          resolved: {
            productId: hit.id,
            internalCategoryId: hit.category,
            serbaSku: hit.sku,
            source: "mapping",
          },
        };
      }
    }
    const byId = [...productBySku.values()].find((p) => p.id === map.product);
    if (byId) {
      return {
        resolved: {
          productId: byId.id,
          internalCategoryId: byId.category,
          serbaSku: byId.sku,
          source: "mapping",
        },
      };
    }
    return {
      resolved: {
        productId: map.product,
        serbaSku: raw,
        source: "mapping",
      },
    };
  }

  return {
    error: `SKU "${raw}" tidak ditemukan di master produk SERBA. ${SKU_NOT_FOUND_HINT}`,
  };
}

/** Input fee: kategori dikunci dari produk SERBA bila SKU dikenali. */
export function lineInputForFees(row: ParsedImportRow, resolved?: ResolvedProduct): LineInput {
  return {
    mpCategory: resolved ? undefined : row.mp_category,
    internalCategoryId: resolved?.internalCategoryId,
    productId: resolved?.productId,
    grossAmount: row.gross_amount,
    qty: row.qty,
  };
}
