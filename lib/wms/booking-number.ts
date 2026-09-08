import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import {
  docDateStamp,
  formatDocNo,
  docNoPattern,
  DOC_SEQ_MAX,
} from "@/lib/bisnis/doc-number";

const PREFIX = "BKG";

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findMaxBookingSeq(): Promise<number> {
  let max = 0;
  const { current } = docNoPattern(PREFIX);
  try {
    const rows = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getFullList({
      filter: `wms_booking_no ~ "${escapeFilter(PREFIX)}"`,
      fields: "wms_booking_no",
      requestKey: null,
    });
    for (const row of rows) {
      const val = (row as { wms_booking_no?: string }).wms_booking_no;
      if (typeof val !== "string") continue;
      const m = val.trim().match(current);
      if (!m) continue;
      const n = Number(m[2]);
      if (n >= 1 && n <= DOC_SEQ_MAX) max = Math.max(max, n);
    }
  } catch {
    return 0;
  }
  return max;
}

/** Nomor booking pengeluaran: BKG090726-0001 (urutan lanjut, wrap setelah 9999). */
export async function nextBookingNo(periodDate?: string | Date): Promise<string> {
  const dateStamp = docDateStamp(periodDate ?? new Date());
  let max = await findMaxBookingSeq();
  for (let attempt = 0; attempt < DOC_SEQ_MAX; attempt++) {
    max = max >= DOC_SEQ_MAX ? 1 : max + 1;
    const candidate = formatDocNo(PREFIX, max, dateStamp);
    const exists = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 1, {
      filter: `wms_booking_no = "${escapeFilter(candidate)}"`,
      requestKey: null,
    });
    if (exists.totalItems === 0) return candidate;
  }
  throw new Error(`Semua nomor ${PREFIX}******-0001 s/d 9999 sudah dipakai.`);
}
