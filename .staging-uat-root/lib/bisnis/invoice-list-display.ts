import { parsePosNotes } from "@/lib/pos/meta";
import type { Invoice, SalesOrder } from "./types";

export type InvoiceSalesChannel = "pos" | "bisnis" | "marketplace";

export type InvoiceFulfillmentRoute = "direct" | "wms";

export type InvoiceListDisplay = {
  channel: InvoiceSalesChannel;
  channelLabel: string;
  route: InvoiceFulfillmentRoute;
  routeLabel: string;
  /** Lewat WMS — sudah divalidasi gudang (komplit). */
  wmsValidated: boolean;
  badgeId: string;
  badgeLabel: string;
  badgeCls: string;
};

const CHANNEL_LABEL: Record<InvoiceSalesChannel, string> = {
  pos: "POS",
  bisnis: "Bisnis",
  marketplace: "Marketplace",
};

function resolveChannel(inv: Invoice, so?: SalesOrder | null): InvoiceSalesChannel {
  if (parsePosNotes(so?.notes)) return "pos";
  if (inv.source === "marketplace_import") return "marketplace";
  return "bisnis";
}

function resolveRoute(so?: SalesOrder | null): InvoiceFulfillmentRoute {
  if (so?.send_to_warehouse_at) return "wms";
  const pos = parsePosNotes(so?.notes);
  if (pos?.mode === "wms") return "wms";
  return "direct";
}

function isWmsValidated(so?: SalesOrder | null): boolean {
  if (!so?.send_to_warehouse_at) return false;
  return (
    so.warehouse_process_status === "complete" ||
    so.status === "delivered" ||
    so.status === "shipped"
  );
}

export function getInvoiceListDisplay(
  inv: Invoice,
  so?: SalesOrder | null,
): InvoiceListDisplay {
  const linked = so ?? inv.expand?.sales_order ?? null;
  const channel = resolveChannel(inv, linked);
  const route = resolveRoute(linked);
  const wmsValidated = route === "wms" && isWmsValidated(linked);

  if (route === "direct") {
    return {
      channel,
      channelLabel: CHANNEL_LABEL[channel],
      route,
      routeLabel: "Langsung",
      wmsValidated: false,
      badgeId: `direct_${channel}`,
      badgeLabel: "Langsung",
      badgeCls: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    };
  }

  if (wmsValidated) {
    return {
      channel,
      channelLabel: CHANNEL_LABEL[channel],
      route,
      routeLabel: "Lewat WMS",
      wmsValidated: true,
      badgeId: "wms_validated",
      badgeLabel: "WMS · Komplit",
      badgeCls: "bg-cyan-50 text-cyan-900 ring-cyan-200",
    };
  }

  return {
    channel,
    channelLabel: CHANNEL_LABEL[channel],
    route,
    routeLabel: "Lewat WMS",
    wmsValidated: false,
    badgeId: "wms_pending_validation",
    badgeLabel: "WMS · Belum validasi",
    badgeCls: "bg-amber-50 text-amber-900 ring-amber-200",
  };
}

export const INVOICE_ROUTE_FILTER = [
  { value: "all", label: "Semua alur" },
  { value: "direct", label: "Langsung" },
  { value: "wms", label: "Lewat WMS" },
] as const;

export function matchesInvoiceRouteFilter(
  inv: Invoice,
  filter: string,
  so?: SalesOrder | null,
): boolean {
  if (filter === "all" || !filter) return true;
  const meta = getInvoiceListDisplay(inv, so);
  if (filter === "direct") return meta.route === "direct";
  if (filter === "wms") return meta.route === "wms";
  return true;
}

/** Label ringkas untuk baris tabel daftar invoice. */
export function getInvoiceListCompactRouteLabel(meta: InvoiceListDisplay): string {
  if (meta.route === "direct") return "Langsung";
  return meta.wmsValidated ? "WMS ✓" : "WMS";
}
