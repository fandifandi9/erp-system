import {
  DOC_SEQ_MAX_WIDE,
  formatDocNo,
  parseDocNoParts,
} from "@/lib/bisnis/doc-number";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";

const TT_PREFIX = "TT";
const LOCAL_SEQ_KEY = "wms_tt_seq_v3";

function readLocalMaxSeq(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(LOCAL_SEQ_KEY) ?? "0");
    return Number.isFinite(n) && n >= 0 ? Math.min(n, DOC_SEQ_MAX_WIDE) : 0;
  } catch {
    return 0;
  }
}

function writeLocalMaxSeq(seq: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SEQ_KEY, String(seq));
  } catch {
    /* ignore */
  }
}

/** Ambil urutan TT tertinggi dari order selesai (snapshot di workflow). */
async function findMaxTtSeqFromOrders(): Promise<number> {
  let max = 0;
  try {
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const rows = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 200, {
      filter: `updated >= "${since}"`,
      sort: "-updated",
      fields: "id,outbound_workflow_json",
      requestKey: null,
    });
    for (const row of rows.items) {
      const tt = parseOutboundWorkflow(row.outbound_workflow_json).pickup?.tt_no?.trim();
      if (!tt) continue;
      const parts = parseDocNoParts(tt, TT_PREFIX);
      if (!parts) continue;
      if (parts.seq >= 1 && parts.seq <= DOC_SEQ_MAX_WIDE) {
        max = Math.max(max, parts.seq);
      }
    }
  } catch {
    /* offline / schema — pakai local */
  }
  return max;
}

/**
 * Nomor tanda terima internal: TT00001 … TT99999 (tanpa tanggal, wrap setelah 99999).
 * Tanggal transaksi tercetak/terpisah di slip, bukan di nomor.
 */
export async function allocateTtNo(_periodDate?: Date): Promise<string> {
  const fromOrders = await findMaxTtSeqFromOrders();
  const fromLocal = readLocalMaxSeq();
  let seq = Math.max(fromOrders, fromLocal) + 1;
  if (seq > DOC_SEQ_MAX_WIDE) seq = 1;
  writeLocalMaxSeq(seq);
  return formatDocNo(TT_PREFIX, seq, "");
}

export type TtLineSnapshot = {
  so_id: string;
  order_no: string;
  /** Nomor invoice — ditampilkan di UI batch; opsional di cetak. */
  invoice_no?: string;
  awb: string;
  pk_no?: string;
  /** Nama toko (bukan gudang) — per baris, karena TT bisa campur toko. */
  store_name?: string;
  /** @deprecated tidak dipakai di TT */
  customer_name?: string;
};
