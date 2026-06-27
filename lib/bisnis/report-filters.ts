import { mergeCompanyFilter } from "./entity-resolve";

export const REPORT_ALL = "all";

/** Dimensi slice laporan — semua nilai "all" = tidak difilter. */
export type ReportDimensionState = {
  storeId?: string;
  warehouseId?: string;
  /** Nilai platform_source / nama channel di invoice. */
  channelId?: string;
  cashAccountId?: string;
};

export type BuildReportFilterOpts = ReportDimensionState & {
  companyId?: string | null;
  /** Field toko — default `store`; pembayaran pakai `invoice.store`. */
  storeField?: string;
  /** Field gudang — default `warehouse`; invoice pakai `sales_order.warehouse`. */
  warehouseField?: string;
  channelField?: string;
  cashAccountField?: string;
};

/** Gabung filter dasar + dimensi toko/gudang/channel/kas + entitas. */
export function buildReportFilter(baseFilter: string, opts: BuildReportFilterOpts): string {
  const parts: string[] = [];
  const base = baseFilter?.trim();
  if (base) parts.push(`(${base})`);

  const storeField = opts.storeField ?? "store";
  if (opts.storeId && opts.storeId !== REPORT_ALL) {
    parts.push(`${storeField} = "${opts.storeId}"`);
  }

  const whField = opts.warehouseField ?? "warehouse";
  if (opts.warehouseId && opts.warehouseId !== REPORT_ALL) {
    parts.push(`${whField} = "${opts.warehouseId}"`);
  }

  const chField = opts.channelField ?? "platform_source";
  if (opts.channelId && opts.channelId !== REPORT_ALL) {
    parts.push(`${chField} = "${opts.channelId}"`);
  }

  const cashField = opts.cashAccountField ?? "cash_account";
  if (opts.cashAccountId && opts.cashAccountId !== REPORT_ALL) {
    parts.push(`${cashField} = "${opts.cashAccountId}"`);
  }

  return mergeCompanyFilter(parts.join(" && "), opts.companyId);
}

export type ReportPeriod = "bulan_ini" | "bulan_lalu" | "3_bulan" | "6_bulan" | "tahun_ini";

export function getReportDateRange(period: ReportPeriod, year?: number): { from: string; to: string; label: string } {
  const now = new Date();
  let from: Date;
  let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  if (year != null) {
    from = new Date(year, 0, 1);
    to = year === now.getFullYear() ? to : new Date(year, 11, 31, 23, 59, 59);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: `Tahun ${year}`,
    };
  }

  switch (period) {
    case "bulan_lalu":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "3_bulan":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "6_bulan":
      from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case "tahun_ini":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const label =
    period === "bulan_ini"
      ? now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
      : period === "bulan_lalu"
        ? new Date(now.getFullYear(), now.getMonth() - 1).toLocaleDateString("id-ID", {
            month: "long",
            year: "numeric",
          })
        : period === "tahun_ini"
          ? `Tahun ${now.getFullYear()}`
          : period.replace("_", " ");

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label,
  };
}

/** Ringkasan dimensi aktif untuk subtitle laporan. */
export function reportDimensionSummary(
  dims: ReportDimensionState,
  labels: {
    stores?: { id: string; name: string }[];
    warehouses?: { id: string; name: string }[];
    channels?: { id: string; name: string }[];
    cashAccounts?: { id: string; name: string }[];
  },
): string {
  const parts: string[] = [];
  if (dims.storeId && dims.storeId !== REPORT_ALL) {
    parts.push(labels.stores?.find((s) => s.id === dims.storeId)?.name ?? "Toko");
  }
  if (dims.warehouseId && dims.warehouseId !== REPORT_ALL) {
    parts.push(labels.warehouses?.find((w) => w.id === dims.warehouseId)?.name ?? "Gudang");
  }
  if (dims.channelId && dims.channelId !== REPORT_ALL) {
    parts.push(dims.channelId);
  }
  if (dims.cashAccountId && dims.cashAccountId !== REPORT_ALL) {
    parts.push(labels.cashAccounts?.find((c) => c.id === dims.cashAccountId)?.name ?? "Rekening");
  }
  return parts.length ? parts.join(" · ") : "";
}
