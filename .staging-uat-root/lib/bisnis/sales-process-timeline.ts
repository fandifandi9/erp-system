import type { SalesOrder } from "@/lib/bisnis/types";
import { parseOutboundWorkflow, type WmsOrderStage } from "@/lib/wms/outbound-workflow";

export type ProcessStepStatus = "done" | "active" | "pending";

export type SalesProcessStep = {
  id: string;
  label: string;
  actor?: string;
  at?: string;
  status: ProcessStepStatus;
  detail?: string;
};

function fmtDt(iso?: string): string | undefined {
  if (!iso?.trim()) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function stageRank(stage: WmsOrderStage): number {
  const order: WmsOrderStage[] = [
    "new_order",
    "picking",
    "validate_pack",
    "ready_pickup",
    "completed",
  ];
  const i = order.indexOf(stage);
  return i >= 0 ? i : -1;
}

function stepStatus(
  stage: WmsOrderStage,
  target: WmsOrderStage,
  doneAt?: string,
  startedAt?: string,
): ProcessStepStatus {
  if (doneAt) return "done";
  const cur = stageRank(stage);
  const tgt = stageRank(target);
  if (cur > tgt) return "done";
  if (cur === tgt || (startedAt && cur >= tgt)) return "active";
  if (cur < tgt) return "pending";
  return "pending";
}

/** Timeline proses penjualan — dibaca dari SO + outbound_workflow_json (bukan input manual). */
export function buildSalesProcessTimeline(
  so: Pick<
    SalesOrder,
    | "created"
    | "order_date"
    | "status"
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "pk_no"
    | "wms_booking_no"
    | "shipped_date"
    | "expand"
  > | null | undefined,
): SalesProcessStep[] {
  if (!so) return [];

  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const stage = wf.stage;
  const steps: SalesProcessStep[] = [];

  const creator =
    so.expand?.created_by?.name?.trim() ||
    so.expand?.created_by?.email?.trim() ||
    undefined;

  steps.push({
    id: "created",
    label: "Diproses",
    actor: creator,
    at: so.created || so.order_date,
    status: "done",
    detail: so.send_to_warehouse_at ? undefined : "Tanpa WMS",
  });

  if (!so.send_to_warehouse_at && !so.outbound_workflow_json) {
    if (so.status === "delivered" || so.status === "shipped") {
      steps.push({
        id: "fulfilled",
        label: so.status === "delivered" ? "Terkirim" : "Dikirim",
        at: so.shipped_date,
        status: "done",
      });
    }
    return steps;
  }

  const pk = so.pk_no?.trim();
  const pkg = wf.package_code?.trim() || so.wms_booking_no?.trim();

  steps.push({
    id: "wms_enqueue",
    label: "Antrean gudang",
    at: so.send_to_warehouse_at,
    status: "done",
    detail: [pk ? `PK ${pk}` : "", pkg ? `Paket ${pkg}` : ""].filter(Boolean).join(" · ") || undefined,
  });

  const pickDone = !!wf.pick?.completed_at;
  steps.push({
    id: "picking",
    label: "Picking",
    actor: wf.pick?.user_name?.trim() || undefined,
    at: pickDone ? wf.pick?.completed_at : wf.pick?.started_at,
    status: pickDone
      ? "done"
      : stage === "picking" || !!wf.pick?.started_at
        ? "active"
        : stepStatus(stage, "picking"),
  });

  const valDone = !!wf.validate_pack?.completed_at;
  const ws = wf.validate_pack?.workstation_code?.trim();
  steps.push({
    id: "validate",
    label: "Validasi & packing",
    actor: wf.validate_pack?.user_name?.trim() || undefined,
    at: valDone ? wf.validate_pack?.completed_at : wf.validate_pack?.started_at,
    status: valDone
      ? "done"
      : stage === "validate_pack"
        ? "active"
        : stepStatus(stage, "validate_pack"),
    detail: ws ? `Stasiun ${ws}` : undefined,
  });

  steps.push({
    id: "ready_pickup",
    label: "Siap serah terima",
    at: stageRank(stage) >= stageRank("ready_pickup") ? wf.stage_entered_at : undefined,
    status:
      stage === "completed"
        ? "done"
        : stage === "ready_pickup"
          ? "active"
          : stageRank(stage) > stageRank("ready_pickup")
            ? "done"
            : "pending",
    detail:
      wf.pickup_gate === "menunggu_awb"
        ? "Menunggu AWB"
        : wf.pickup_gate === "siap_serah"
          ? "Siap serah ke kurir"
          : undefined,
  });

  if (wf.pickup?.at) {
    steps.push({
      id: "pickup",
      label: "Serah terima kurir",
      actor: wf.pickup.user_name?.trim() || wf.pickup.driver_name?.trim() || undefined,
      at: wf.pickup.at,
      status: "done",
      detail: wf.pickup.courier_company?.trim() || undefined,
    });
  }

  if (stage === "completed" || so.status === "delivered") {
    steps.push({
      id: "completed",
      label: "Selesai",
      at: wf.pickup?.at || wf.validate_pack?.completed_at || so.shipped_date,
      status: "done",
    });
  } else if (stage === "cancelled") {
    steps.push({
      id: "cancelled",
      label: "Dibatalkan",
      detail: wf.cancel_reason?.trim(),
      status: "done",
    });
  } else if (stage === "validation_failed") {
    steps.push({
      id: "validation_failed",
      label: "Validasi gagal",
      detail: wf.validation_fail_reason?.trim(),
      status: "active",
    });
  }

  return steps;
}

export function formatProcessStepTime(at?: string): string | undefined {
  return fmtDt(at);
}
