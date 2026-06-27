import type { SalesOrder } from "@/lib/bisnis/types";
import { parseOutboundWorkflow, serializeOutboundWorkflow } from "./outbound-workflow";
import { getPkFromSo } from "./pk-identity";
import { buildPkQrPayload, formatPkDisplay } from "./pk-number";

/**
 * WMS hanya mencerminkan nomor PK yang sudah ditetapkan di SO (dari POS / pembuat order).
 * Tidak membuat nomor PK urut baru.
 */
export function mirrorPkOnOutboundWorkflow(
  so: Pick<SalesOrder, "pk_no" | "order_no" | "outbound_workflow_json">,
  workflowJson: string,
  now: string,
): { workflowJson: string; pkNo: string } {
  const raw = getPkFromSo(so)?.trim() || so.order_no?.trim();
  if (!raw) {
    throw new Error("SO belum punya nomor pesanan / PK — tidak bisa masuk antrean WMS.");
  }
  const pkNo = formatPkDisplay(raw);
  const wf = parseOutboundWorkflow(workflowJson);
  const merged = {
    ...wf,
    pk_no: pkNo,
    pk_qr_payload: buildPkQrPayload(pkNo),
    pk_assigned_at: wf.pk_assigned_at ?? now,
  };
  return { workflowJson: serializeOutboundWorkflow(merged), pkNo };
}

/** @deprecated Gunakan mirrorPkOnOutboundWorkflow */
export const ensurePkOnOutboundWorkflow = mirrorPkOnOutboundWorkflow;
