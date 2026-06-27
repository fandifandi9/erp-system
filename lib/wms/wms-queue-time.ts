import type { SalesOrder } from "@/lib/bisnis/types";
import {
  getOutboundStageFromSo,
  parseOutboundWorkflow,
  WMS_STAGE_UI,
  type WmsOrderStage,
} from "./outbound-workflow";

export type WmsTimeDisplayMode = "active" | "history";

function firstIso(...values: Array<string | undefined | null>): string | null {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

/** Waktu masuk tahap saat ini — reset tiap pindah tahap WMS. */
export function getWmsStageSinceIso(
  so: Pick<
    SalesOrder,
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "created"
    | "updated"
    | "status"
    | "warehouse_process_status"
  >,
): string | null {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const stage = getOutboundStageFromSo(so);

  if (wf.stage_entered_at?.trim()) {
    return wf.stage_entered_at.trim();
  }

  switch (stage) {
    case "new_order":
    case "picking":
      return firstIso(
        wf.pick?.started_at,
        wf.pk_assigned_at,
        so.send_to_warehouse_at,
        so.created,
      );
    case "validate_pack":
    case "validation_failed":
      return firstIso(
        wf.pick?.completed_at,
        wf.validate_pack?.started_at,
        wf.pick?.started_at,
        so.send_to_warehouse_at,
      );
    case "ready_pickup":
      return firstIso(
        wf.validate_pack?.completed_at,
        wf.validate_pack?.at,
        wf.pick?.completed_at,
      );
    case "completed":
      return firstIso(wf.pickup?.at, wf.validate_pack?.completed_at, so.updated);
    case "cancelled":
      return firstIso(wf.updated_at, so.updated);
    default:
      return firstIso(so.send_to_warehouse_at, so.created);
  }
}

/** Tanggal selesai / arsip untuk tab histori. */
export function getWmsHistoryIso(
  so: Pick<SalesOrder, "send_to_warehouse_at" | "outbound_workflow_json" | "updated">,
): string | null {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  return firstIso(
    wf.pickup?.at,
    wf.validate_pack?.completed_at,
    wf.pick?.completed_at,
    so.send_to_warehouse_at,
    so.updated,
  );
}

export function formatWmsHistoryDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Status relatif — "3 menit yang lalu", "1 jam yang lalu", … */
export function formatWmsRelativeTime(iso?: string | null, nowMs: number = Date.now()): string {
  if (!iso?.trim()) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 45) return "baru saja";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} menit yang lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam yang lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari yang lalu`;
  return formatWmsHistoryDate(iso);
}

export function getWmsStageWaitMinutes(iso: string | null, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60_000));
}

/** Warna teks urgensi antrean aktif. */
export function wmsStageWaitToneClass(minutes: number | null): string {
  if (minutes === null) return "text-slate-500";
  if (minutes < 30) return "text-slate-600";
  if (minutes < 120) return "text-amber-800 font-semibold";
  return "text-red-800 font-semibold";
}

function stageShortLabel(stage: WmsOrderStage): string {
  return WMS_STAGE_UI[stage]?.label ?? stage;
}

export function formatWmsOrderTimeLabel(
  so: Pick<
    SalesOrder,
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "created"
    | "updated"
    | "status"
    | "warehouse_process_status"
  >,
  opts?: { nowMs?: number; mode?: WmsTimeDisplayMode },
): string {
  const stage = getOutboundStageFromSo(so);
  const mode =
    opts?.mode ?? (stage === "completed" || stage === "cancelled" ? "history" : "active");

  if (mode === "history") {
    const iso = getWmsHistoryIso(so);
    return iso ? formatWmsHistoryDate(iso) : "—";
  }

  const since = getWmsStageSinceIso(so);
  return formatWmsRelativeTime(since, opts?.nowMs);
}

/** Satu baris antrean: "Picking · 3 menit yang lalu" */
export function formatWmsStageWaitLine(
  so: Pick<SalesOrder, "send_to_warehouse_at" | "outbound_workflow_json" | "created" | "updated" | "status" | "warehouse_process_status">,
  opts?: { nowMs?: number; mode?: WmsTimeDisplayMode },
): string {
  const stage = getOutboundStageFromSo(so);
  const mode =
    opts?.mode ?? (stage === "completed" || stage === "cancelled" ? "history" : "active");
  const nowMs = opts?.nowMs ?? Date.now();

  if (mode === "history") {
    const date = formatWmsOrderTimeLabel(so, { mode: "history" });
    return `Selesai · ${date}`;
  }

  const since = getWmsStageSinceIso(so);
  const rel = formatWmsRelativeTime(since, nowMs);
  return `${stageShortLabel(stage)} · ${rel}`;
}

/** @deprecated gunakan formatWmsStageWaitLine */
export function formatWmsQueueAge(
  so: Pick<
    SalesOrder,
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "created"
    | "updated"
    | "status"
    | "warehouse_process_status"
  >,
  nowMs?: number,
): string {
  return formatWmsStageWaitLine(so, { nowMs });
}

/** @deprecated gunakan getWmsStageSinceIso */
export function getWmsQueueSinceIso(
  so: Pick<
    SalesOrder,
    | "send_to_warehouse_at"
    | "outbound_workflow_json"
    | "created"
    | "updated"
    | "status"
    | "warehouse_process_status"
  >,
): string | null {
  return getWmsStageSinceIso(so);
}
