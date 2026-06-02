"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PackageOpen, ChevronRight } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsBadge, WmsCard, WmsFlowBar, WmsSectionTitle } from "@/components/wms/ui";
import { WMS_FLOW_STEPS } from "@/lib/wms/navigation";
import {
  fetchPurchaseOrders,
  getWarehouseProcessStatus,
  purchaseOrdersReceivingPbFilter,
  WAREHOUSE_PROCESS_STATUS_UI,
} from "@/lib/bisnis/client";
import type { PurchaseOrder, WarehouseProcessStatus } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

const WH_BADGE_TONE: Record<
  WarehouseProcessStatus,
  "slate" | "emerald" | "amber" | "indigo" | "violet"
> = {
  pending: "slate",
  checking: "indigo",
  hold: "amber",
  processing: "violet",
  complete: "emerald",
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function GudangPenerimaanPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchPurchaseOrders({
        page: 1,
        perPage: 50,
        filter: purchaseOrdersReceivingPbFilter(),
        expand: "supplier,warehouse,created_by,warehouse_processed_by",
        sort: "-send_to_warehouse_at",
      });
      setOrders(res.items);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat daftar penerimaan"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = orders.filter((o) => getWarehouseProcessStatus(o) === "pending").length;
  const hold = orders.filter((o) => getWarehouseProcessStatus(o) === "hold").length;

  return (
    <InventoryGate>
      <InventoryShell
        title="Penerimaan Barang"
        subtitle="Penerimaan barang (PO) — masukkan ke gudang & ruangan tujuan (beda dari picking SO yang mengeluarkan stok)."
        module="wms"
      >
        <WmsCard padding="p-4">
          <WmsFlowBar steps={WMS_FLOW_STEPS} activeIndex={1} />
        </WmsCard>

        <div className="grid gap-4 sm:grid-cols-3">
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Antrean</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{orders.length}</p>
          </WmsCard>
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Menunggu</p>
            <p className="mt-1 text-2xl font-bold text-slate-700">{pending}</p>
          </WmsCard>
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hold</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{hold}</p>
          </WmsCard>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <p className="mt-2 text-xs text-red-700">
              Pastikan field gudang sudah ditambahkan di collection{" "}
              <code className="rounded bg-red-100 px-1">biz_purchase_orders</code> (lihat{" "}
              <code className="rounded bg-red-100 px-1">pocketbase_migration.json</code> step 14).
            </p>
          </div>
        ) : null}

        <WmsCard>
          <WmsSectionTitle
            title="Daftar PO menunggu penerimaan"
            subtitle="Barang masuk — gudang tujuan tertera; di detail PO tentukan/sesuaikan ruangan per produk"
          />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <PackageOpen className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Belum ada PO di antrean penerimaan.</p>
              <p className="mt-1 text-xs text-slate-400">
                Admin bisnis harus klik &quot;Kirim ke Gudang&quot; di detail PO.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {orders.map((po) => {
                const whStatus = getWarehouseProcessStatus(po)!;
                const st = WAREHOUSE_PROCESS_STATUS_UI[whStatus];
                const orderer =
                  po.expand?.created_by?.name || po.expand?.created_by?.email || "—";
                return (
                  <li key={po.id}>
                    <Link
                      href={`/gudang/penerimaan/${po.id}`}
                      className="flex flex-wrap items-center gap-3 px-1 py-4 transition hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-indigo-700">
                            {po.po_no}
                          </span>
                          <WmsBadge tone={WH_BADGE_TONE[whStatus]}>{st.label}</WmsBadge>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {po.expand?.supplier?.name ?? "Supplier"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Pemesan: {orderer} · Gudang: {po.expand?.warehouse?.name ?? "—"} ·{" "}
                          {fmtDate(po.send_to_warehouse_at)}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
