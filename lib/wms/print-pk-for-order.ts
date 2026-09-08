import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { getPkIdentityView } from "@/lib/wms/pk-identity";
import type { PkReceiptData } from "@/lib/wms/print-pk-receipt";
import { printPkReceiptsSmart } from "@/lib/wms/print-pk-smart";
import { parseOutboundWorkflow, serializeOutboundWorkflow } from "@/lib/wms/outbound-workflow";

/** Simpan tanda "sudah dicetak" pada SO (persist untuk indikator antrean). */
export async function persistPkPrinted(so: Pick<SalesOrder, "id" | "outbound_workflow_json">): Promise<void> {
  try {
    const wf = parseOutboundWorkflow(so.outbound_workflow_json);
    if (wf.pk_printed_at) return;
    const next = { ...wf, pk_printed_at: new Date().toISOString() };
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, {
      outbound_workflow_json: serializeOutboundWorkflow(next),
    });
  } catch {
    /* indikator opsional — jangan blokir cetak */
  }
}

function pkReceiptDataFromSo(so: SalesOrder): PkReceiptData | null {
  const pk = getPkIdentityView(so);
  if (!pk.pkNo || pk.pkNo === "—") return null;
  return {
    pkNo: pk.pkNo,
    // QR berisi kode PK polos (persis yang tertulis di slip), bukan "serba:pk:...".
    // Scanner sistem tetap mengenalinya (parsePkScanPayload menerima kode polos).
    qrPayload: pk.pkNo,
    orderNo: so.order_no,
    customerName: so.expand?.customer?.name,
    warehouseName: so.expand?.warehouse?.name,
  };
}

export async function printPkForSalesOrder(so: SalesOrder): Promise<boolean> {
  const data = pkReceiptDataFromSo(so);
  if (!data) return false;
  await printPkReceiptsSmart([data]);
  await persistPkPrinted(so);
  return true;
}

/** Cetak banyak slip PK sekaligus dalam SATU job (printer khusus via QZ, atau 1 dialog). */
export async function printPksForSalesOrders(orders: SalesOrder[]): Promise<SalesOrder[]> {
  const valid = orders
    .map((so) => ({ so, data: pkReceiptDataFromSo(so) }))
    .filter((v): v is { so: SalesOrder; data: PkReceiptData } => v.data !== null);
  if (valid.length === 0) return [];
  await printPkReceiptsSmart(valid.map((v) => v.data));
  for (const v of valid) await persistPkPrinted(v.so);
  return valid.map((v) => v.so);
}
