import type { ActivityEvent, ActivityModule } from "./types";

export function parseActivityPayload(raw?: string | null): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const MODULE_HOME: Record<ActivityModule, string> = {
  sales: "/bisnis/penjualan",
  warehouse: "/gudang/penerimaan",
  purchase: "/bisnis/purchase-order",
  finance: "/keuangan",
  hr: "/hr/attendance",
  settings: "/pengaturan",
};

function wmsOrderPath(eventCode: string, soId: string): string {
  const base = "/wms/permintaan-barang";
  if (eventCode.includes("pickup") || eventCode === "wms.ready_pickup") {
    return `${base}/pickup?so=${encodeURIComponent(soId)}`;
  }
  if (
    eventCode.includes("pack") ||
    eventCode.includes("validate") ||
    eventCode === "wms.awb.uploaded"
  ) {
    return `${base}/validasi?so=${encodeURIComponent(soId)}`;
  }
  return `${base}/picking?so=${encodeURIComponent(soId)}`;
}

/** URL tujuan sekali klik — spesifik entitas, fallback modul. */
export function resolveActivityActionUrl(
  ev: Pick<ActivityEvent, "event_code" | "entity_type" | "entity_id" | "module">,
  payload?: Record<string, unknown>,
): string {
  const actionUrl = payload?.action_url;
  if (typeof actionUrl === "string" && actionUrl.startsWith("/")) {
    return actionUrl;
  }

  const id = ev.entity_id?.trim();
  const entityType = ev.entity_type?.trim() ?? "";

  if (id) {
    if (
      entityType === "biz_sales_orders" ||
      ev.event_code.startsWith("wms.") ||
      ev.event_code === "sales.order.sent_wms"
    ) {
      return wmsOrderPath(ev.event_code, id);
    }
    if (entityType === "biz_invoices") {
      const soId = payload?.sales_order_id ?? payload?.sales_order;
      if (typeof soId === "string" && soId) return `/bisnis/penjualan/${soId}`;
      return `/bisnis/invoice`;
    }
    if (entityType === "biz_purchase_orders") {
      if (
        ev.module === "warehouse" ||
        ev.event_code.startsWith("warehouse.") ||
        ev.event_code.startsWith("purchase.receiving")
      ) {
        return `/gudang/penerimaan/${id}`;
      }
      return `/bisnis/purchase-order`;
    }
    if (entityType === "biz_returs") {
      if (ev.event_code.startsWith("retur.purchase")) {
        return `/bisnis/retur/${id}`;
      }
      return `/gudang/penerimaan/retur/${id}`;
    }
    if (entityType === "biz_purchase_bills") {
      return `/bisnis/pembelian/${id}`;
    }
  }

  if (ev.event_code === "sales.order.sent_wms" && id) {
    return wmsOrderPath(ev.event_code, id);
  }
  if (ev.event_code.startsWith("purchase.receiving") && id) {
    return `/gudang/penerimaan/${id}`;
  }
  if (ev.event_code.startsWith("retur.") && id) {
    return ev.event_code.startsWith("retur.purchase")
      ? `/bisnis/retur/${id}`
      : `/gudang/penerimaan/retur/${id}`;
  }

  if (ev.event_code === "payroll_bank.change_requested") {
    return "/pengaturan/persetujuan-rekening";
  }
  if (
    ev.event_code === "payroll_bank.change_approved" ||
    ev.event_code === "payroll_bank.change_rejected"
  ) {
    return "/profile";
  }

  return MODULE_HOME[ev.module] ?? "/aktivitas";
}

export function activitySeverityClass(severity?: string): string {
  switch (severity) {
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    default:
      return "bg-indigo-500";
  }
}
