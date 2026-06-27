import type { SalesOrder } from "@/lib/bisnis/types";
import type { ProductPickHint } from "@/lib/wms/product-placement-client";
import type { PickupGate } from "@/lib/wms/awb-pickup-gate";
import {
  getOutboundStageFromSo,
  type WmsOrderStage,
} from "@/lib/wms/outbound-workflow";
import {
  getWmsHistoryIso,
  getWmsStageSinceIso,
  type WmsTimeDisplayMode,
} from "@/lib/wms/wms-queue-time";
import type { Locale } from "./types";

export type TranslateFn = (
  path: string,
  vars?: Record<string, string | number | undefined>,
) => string;

const STAGE_KEYS: Record<WmsOrderStage, string> = {
  new_order: "wms.stage.newOrder",
  picking: "wms.stage.picking",
  validate_pack: "wms.stage.validatePack",
  ready_pickup: "wms.stage.readyPickup",
  completed: "wms.stage.completed",
  cancelled: "wms.stage.cancelled",
  validation_failed: "wms.stage.validationFailed",
};

export function getWmsStageLabel(t: TranslateFn, stage: WmsOrderStage): string {
  const key = STAGE_KEYS[stage];
  const val = t(key);
  return val === key ? stage : val;
}

export function getPickupGateLabel(t: TranslateFn, gate: PickupGate): string {
  return gate === "menunggu_awb" ? t("wms.pickup.gateAwaitingAwb") : t("wms.pickup.gateReadyHandover");
}

function historyDateLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "id-ID";
}

export function formatWmsHistoryDateLocalized(locale: Locale, iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(historyDateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatWmsRelativeTimeLocalized(
  t: TranslateFn,
  locale: Locale,
  iso?: string | null,
  nowMs: number = Date.now(),
): string {
  if (!iso?.trim()) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 45) return t("wms.time.justNow");
  const min = Math.floor(diffSec / 60);
  if (min < 60) return t("wms.time.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("wms.time.hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t("wms.time.daysAgo", { n: day });
  return formatWmsHistoryDateLocalized(locale, iso);
}

export function formatWmsStageWaitLineLocalized(
  t: TranslateFn,
  locale: Locale,
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
  const nowMs = opts?.nowMs ?? Date.now();

  if (mode === "history") {
    const iso = getWmsHistoryIso(so);
    const date = iso ? formatWmsHistoryDateLocalized(locale, iso) : "—";
    return `${t("wms.time.completedPrefix")} ${date}`;
  }

  const since = getWmsStageSinceIso(so);
  const rel = formatWmsRelativeTimeLocalized(t, locale, since, nowMs);
  return `${getWmsStageLabel(t, stage)} · ${rel}`;
}

export function formatPickHintLineLocalized(
  t: TranslateFn,
  hint: ProductPickHint | undefined,
  _opts?: { noRoomsInWarehouse?: boolean; warehouseName?: string },
): string {
  if (hint?.wrongWarehouse) {
    const wh = hint.otherWarehouseName ?? t("wms.pickHint.otherWarehouse");
    return t("wms.pickHint.wrongWarehouse", { warehouse: wh });
  }
  return "";
}
