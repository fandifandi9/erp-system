import type { SalesOrder } from "@/lib/bisnis/types";
import { buildPkQrPayload, normalizePkCompareKey, parsePkScanPayload, pkCodeBody } from "./pk-number";
import { parseOutboundWorkflow } from "./outbound-workflow";

export type PkIdentityView = {
  /** Badan nomor saja (tanpa awalan "PK") — untuk tampilan. */
  pkNo: string;
  qrPayload: string;
};

export function getPkFromSo(
  so: Pick<SalesOrder, "pk_no" | "outbound_workflow_json">,
): string | null {
  const direct = so.pk_no?.trim();
  if (direct) return direct;
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const fromWf = wf.pk_no?.trim();
  return fromWf || null;
}

export function getPkIdentityView(
  so: Pick<SalesOrder, "pk_no" | "outbound_workflow_json">,
): PkIdentityView {
  const raw = getPkFromSo(so);
  const pkNo = raw ? pkCodeBody(raw) : "—";
  return {
    pkNo,
    qrPayload: pkNo !== "—" ? buildPkQrPayload(pkNo) : "",
  };
}

export function orderMatchesPkScan(
  so: Pick<SalesOrder, "pk_no" | "outbound_workflow_json">,
  rawScan: string,
): boolean {
  const pk = getPkFromSo(so);
  if (!pk) return false;
  const scanned = parsePkScanPayload(rawScan) ?? rawScan.trim();
  if (!scanned) return false;
  return normalizePkCompareKey(pk) === normalizePkCompareKey(scanned);
}
