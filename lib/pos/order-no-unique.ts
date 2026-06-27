import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parsePosNotes } from "@/lib/pos/meta";

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Kunci perbandingan nomor pesanan — abaikan spasi & huruf besar/kecil. */
export function normalizeOrderNoKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function orderBelongsToStore(
  so: Pick<SalesOrder, "store" | "notes">,
  storeId: string,
  storeName: string,
): boolean {
  if (so.store?.trim() === storeId) return true;
  const meta = parsePosNotes(so.notes);
  if (meta?.store_id) return meta.store_id === storeId;
  if (meta?.store_name && storeName) {
    return meta.store_name.trim().toLowerCase() === storeName.trim().toLowerCase();
  }
  return false;
}

/** Cari pesanan lain di toko yang sama dengan nomor order identik (normalisasi). */
export async function findDuplicateOrderNoForStore(
  pb: PocketBase,
  storeId: string,
  storeName: string,
  orderNoRaw: string,
  excludeId?: string,
): Promise<{ orderNo: string; salesOrderId: string } | null> {
  const key = normalizeOrderNoKey(orderNoRaw);
  if (!key || key.length < 2) return null;

  const filters = [
    `store = "${escapeFilter(storeId)}" && status != "cancelled"`,
    `notes ~ "[[POS_META]]" && status != "cancelled"`,
  ];

  const seen = new Set<string>();

  for (const filter of filters) {
    let page = 1;
    for (;;) {
      const batch = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(page, 50, {
        filter,
        fields: "id,order_no,store,notes,status",
        sort: "-created",
        requestKey: null,
      });
      for (const so of batch.items) {
        if (excludeId && so.id === excludeId) continue;
        if (seen.has(so.id)) continue;
        seen.add(so.id);
        if (!orderBelongsToStore(so, storeId, storeName)) continue;
        if (normalizeOrderNoKey(so.order_no) === key) {
          return { orderNo: so.order_no, salesOrderId: so.id };
        }
      }
      if (batch.page >= batch.totalPages) break;
      page += 1;
    }
  }

  return null;
}

export async function assertOrderNoUniqueForStore(
  pb: PocketBase,
  storeId: string,
  storeName: string,
  orderNoRaw: string,
  excludeId?: string,
): Promise<void> {
  const dup = await findDuplicateOrderNoForStore(pb, storeId, storeName, orderNoRaw, excludeId);
  if (dup) {
    throw new Error(
      `No. pesanan "${orderNoRaw.trim()}" sudah dipakai di toko ini (order ${dup.orderNo}). Gunakan nomor lain.`,
    );
  }
}
