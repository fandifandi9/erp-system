import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  type OutboundWorkflow,
} from "./outbound-workflow";
import type { WmsWorkstation } from "./workstations";

export type ValidatorAudit = {
  userId: string;
  userName?: string;
  userRole?: string;
  workstation?: WmsWorkstation | null;
  workstationSessionId?: string;
};

export function buildValidatePackAuditFields(
  audit: ValidatorAudit,
  existing?: OutboundWorkflow["validate_pack"],
): NonNullable<OutboundWorkflow["validate_pack"]> {
  const now = new Date().toISOString();
  const ws = audit.workstation;
  return {
    ...existing,
    user_id: audit.userId,
    user_name: audit.userName,
    user_role: audit.userRole,
    started_at: existing?.started_at ?? now,
    workstation_id: ws?.id,
    workstation_code: ws?.code,
    workstation_name: ws?.name,
    workstation_location: ws?.location,
    workstation_cctv: ws?.cctv,
    cctv_no: ws?.cctv,
    workstation_session_id: audit.workstationSessionId,
  };
}

/** Mulai sesi validasi — catat validator + workstation otomatis. */
export async function ensureValidatePackSession(
  so: SalesOrder,
  audit: ValidatorAudit,
): Promise<SalesOrder> {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  if (wf.validate_pack?.started_at && wf.validate_pack.user_id === audit.userId) {
    return so;
  }
  const nextWf: OutboundWorkflow = {
    ...wf,
    validate_pack: buildValidatePackAuditFields(audit, wf.validate_pack),
  };
  const json = serializeOutboundWorkflow(nextWf);
  return pb.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(so.id, {
    outbound_workflow_json: json,
  });
}

export function validationProgress(lines: { qty: number; validated: number }[]) {
  const totalSku = lines.length;
  const validSku = lines.filter((l) => l.validated >= l.qty && l.qty > 0).length;
  const pendingSku = totalSku - validSku;
  const pct = totalSku ? Math.round((validSku / totalSku) * 100) : 0;
  return { totalSku, validSku, pendingSku, pct };
}
