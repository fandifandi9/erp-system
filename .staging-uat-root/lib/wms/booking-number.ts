import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { docPeriodKey, formatDocNo, parseDocNoSeq, DOC_SEQ_MAX } from "@/lib/bisnis/doc-number";

const PREFIX = "BKG";

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findMaxBookingSeq(periodKey: string): Promise<number> {
  let max = 0;
  const needle = `${PREFIX}-${periodKey}-`;
  try {
    const rows = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getFullList({
      filter: `wms_booking_no ~ "${escapeFilter(needle)}"`,
      fields: "wms_booking_no",
      requestKey: null,
    });
    for (const row of rows) {
      const val = (row as { wms_booking_no?: string }).wms_booking_no;
      if (typeof val !== "string") continue;
      const seq = parseDocNoSeq(val, PREFIX, periodKey);
      if (seq != null) max = Math.max(max, seq);
    }
  } catch {
    return 0;
  }
  return max;
}

/** Nomor booking pengeluaran: BKG-MMYYYY-00001 */
export async function nextBookingNo(periodDate?: string | Date): Promise<string> {
  const periodKey = docPeriodKey(periodDate ?? new Date());
  let max = await findMaxBookingSeq(periodKey);
  for (let attempt = 0; attempt < DOC_SEQ_MAX; attempt++) {
    max = max >= DOC_SEQ_MAX ? 1 : max + 1;
    const candidate = formatDocNo(PREFIX, max, periodKey);
    const exists = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 1, {
      filter: `wms_booking_no = "${escapeFilter(candidate)}"`,
      requestKey: null,
    });
    if (exists.totalItems === 0) return candidate;
  }
  throw new Error(`Semua nomor ${PREFIX}-${periodKey} sudah dipakai.`);
}
