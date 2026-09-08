import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Invoice, type SalesOrder } from "@/lib/bisnis/types";
import { describeOrderForQueue } from "@/lib/wms/outbound-queues";

/** Ambil map soId → invoice_no untuk order yang belum punya invoice di meta. */
export async function fetchMissingInvoiceNos(
  orders: SalesOrder[],
): Promise<Record<string, string>> {
  const missingIds = orders
    .filter((so) => !describeOrderForQueue(so).invoiceNo)
    .map((so) => so.id);
  if (missingIds.length === 0) return {};

  const out: Record<string, string> = {};
  const chunkSize = 25;
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize);
    const filter = chunk.map((id) => `sales_order = "${id.replace(/"/g, '\\"')}"`).join(" || ");
    try {
      const rows = await pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
        filter: `(${filter}) && status != "cancelled"`,
        fields: "sales_order,invoice_no",
        sort: "-created",
        requestKey: null,
      });
      for (const row of rows) {
        const soId = typeof row.sales_order === "string" ? row.sales_order : "";
        const invNo = row.invoice_no?.trim();
        if (soId && invNo && !out[soId]) out[soId] = invNo;
      }
    } catch {
      /* ignore — tampilan tetap fallback SO */
    }
  }
  return out;
}
