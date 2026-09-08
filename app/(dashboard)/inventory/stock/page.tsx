"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import Link from "next/link";
import { fetchWarehouseStockList } from "@/lib/inventory/client";
import { useWorkContext } from "@/components/WorkContextProvider";
import type { InvStockBalance, InvWarehouse } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import { downloadInventoryStockXlsx } from "@/lib/export/inventory-xlsx";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { WmsCard, WmsBadge } from "@/components/wms/ui";
import { useLocale } from "@/components/LocaleProvider";

export default function InventoryStockPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const warehouseFromUrl = searchParams.get("warehouse")?.trim() || "";
  const { warehouses: ctxWarehouses, loading: ctxLoading } = useWorkContext();

  const warehouses = useMemo(
    () =>
      ctxWarehouses.map(
        (w) =>
          ({
            id: w.id,
            code: w.code,
            name: w.name,
          }) as InvWarehouse,
      ),
    [ctxWarehouses],
  );

  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<InvStockBalance[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (ctxLoading || warehouses.length === 0) return;
    if (warehouseFromUrl && warehouses.some((x) => x.id === warehouseFromUrl)) {
      setWarehouseId(warehouseFromUrl);
    } else if (!warehouseId && warehouses[0]) {
      setWarehouseId(warehouses[0].id);
    }
  }, [ctxLoading, warehouses, warehouseFromUrl, warehouseId]);

  const loadStock = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const res = await fetchWarehouseStockList({ warehouseId, perPage: 200 });
      setRows(res.items);
      setDraftCount(res.draftCount);
    } catch {
      setRows([]);
      setDraftCount(0);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  const whCode = warehouses.find((w) => w.id === warehouseId)?.code ?? "gudang";
  const pageBooting = ctxLoading && warehouses.length === 0;

  const handleExportExcel = async () => {
    if (rows.length === 0) return;
    setExporting(true);
    try {
      await downloadInventoryStockXlsx(
        rows.map((r) => {
          const p = r.expand?.product;
          return {
            sku: p?.sku || "—",
            product_name: p?.name || r.product,
            warehouse_code: whCode,
            qty_on_hand: r.qty_on_hand ?? 0,
            qty_reserved: r.qty_reserved ?? 0,
            qty_available: r.qty_available ?? 0,
          };
        }),
        `stok-inventory-${whCode}-${new Date().toISOString().split("T")[0]}.xlsx`,
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal export Excel");
    } finally {
      setExporting(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.stock.title")}
        subtitle={t("inventory.stock.subtitle")}
      >
        {!loading && rows.length === 0 && draftCount > 0 ? (
          <WmsCard className="!border-amber-200 !bg-amber-50/90">
            <div className="flex gap-3 text-sm text-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">Ada {draftCount} mutasi masih draf</p>
                <p className="mt-1">
                  Stok belum berubah. Buka <strong>Mutasi stok</strong> → <strong>Detail</strong> →{" "}
                  <strong>Posting mutasi</strong>.
                </p>
                <Link href="/inventory/movements" className="mt-2 inline-block font-medium text-indigo-700 hover:underline">
                  Ke daftar mutasi →
                </Link>
              </div>
            </div>
          </WmsCard>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            {t("inventory.common.warehouse")}{" "}
            <select
              className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={pageBooting || warehouses.length === 0}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={exporting || loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export Excel
          </button>
        </div>

        <WmsCard padding="p-0" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">{t("inventory.common.product")}</th>
                  <th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Reserved</th>
                  <th className="px-4 py-3">Tersedia</th>
                  <th className="px-4 py-3">{t("inventory.common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {pageBooting || loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {t("inventory.stock.empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const p = r.expand?.product;
                    const low = p && (p.min_stock ?? 0) > 0 && (r.qty_on_hand ?? 0) < (p.min_stock ?? 0);
                    return (
                      <tr
                        key={r.id}
                        className={"border-t border-slate-100 " + (low ? "bg-amber-50/80" : "")}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{p?.sku || "—"}</td>
                        <td className="px-4 py-3">{p?.name || r.product}</td>
                        <td
                          className={`px-4 py-3 font-semibold ${
                            (r.qty_on_hand ?? 0) < 0 ? "text-red-700" : ""
                          }`}
                        >
                          {formatIntegerId(r.qty_on_hand)}
                        </td>
                        <td className="px-4 py-3">{formatIntegerId(r.qty_reserved)}</td>
                        <td
                          className={`px-4 py-3 ${
                            (r.qty_available ?? 0) < 0 ? "font-semibold text-red-700" : ""
                          }`}
                        >
                          {formatIntegerId(r.qty_available)}
                        </td>
                        <td className="px-4 py-3">
                          {(r.qty_on_hand ?? 0) < 0 ? (
                            <WmsBadge tone="red">Minus</WmsBadge>
                          ) : low ? (
                            <WmsBadge tone="amber">Rendah</WmsBadge>
                          ) : (
                            <WmsBadge tone="emerald">OK</WmsBadge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
