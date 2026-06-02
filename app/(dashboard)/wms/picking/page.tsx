"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Scan, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  WmsCard,
  WmsNavTile,
  WmsPrimaryButton,
  WmsSectionTitle,
  WmsBadge,
} from "@/components/wms/ui";
import { BISNIS_COLLECTIONS, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { fetchStockMapByWarehouse, getStockQtyFromMap } from "@/lib/wms/stock";
import { validateBarcodeScan, validatePickingQty } from "@/lib/wms/validations";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/client";
import { formatIntegerId } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/errors";
import {
  fetchProductPickHints,
  formatPickHintLine,
  type ProductPickHint,
} from "@/lib/wms/product-placement-client";
import {
  mergeOutboundLinesFromSo,
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  isPickComplete,
} from "@/lib/wms/outbound-workflow";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";

type PickLine = {
  product: string;
  sku: string;
  name: string;
  qty: number;
  picked: number;
  pickHint?: ProductPickHint;
};

export default function WmsPickingPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<PickLine[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [scanCode, setScanCode] = useState("");
  const [trackScan, setTrackScan] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "tracking_scan">("manual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingNo, setBookingNo] = useState<string | null>(null);
  const [warehouseRoomCount, setWarehouseRoomCount] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      try {
        res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 50, {
          filter: salesOrdersPickingPbFilter(),
          sort: "-created",
          expand: "warehouse,customer",
          requestKey: null,
        });
      } catch {
        // fallback bila field WMS SO belum ditambahkan di schema PocketBase
        res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 50, {
          filter: 'status != "cancelled" && status != "delivered"',
          sort: "-created",
          expand: "warehouse,customer",
          requestKey: null,
        });
      }
      setOrders(res.items);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const loadOrderLines = async (so: SalesOrder) => {
    setError("");
    setSelectedSo(so);
    const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
      filter: `sales_order = "${so.id}"`,
      expand: "product",
      requestKey: null,
    });
    const productIds = soLines.map((l) => l.product).filter(Boolean);
    let hints: Record<string, ProductPickHint> = {};
    setWarehouseRoomCount(null);
    if (so.warehouse && productIds.length > 0) {
      const placement = await fetchProductPickHints(so.warehouse, productIds);
      hints = placement.hints;
      setWarehouseRoomCount(placement.roomCount);
      if (placement.error) {
        setError(placement.error);
      }
    }
    setLines(
      soLines.map((l) => ({
        product: l.product,
        sku: l.sku_snapshot || l.expand?.product?.sku || "—",
        name: l.name_snapshot || l.expand?.product?.name || l.product,
        qty: Number(l.qty) || 0,
        picked: 0,
        pickHint: hints[l.product],
      })),
    );
    if (so.warehouse) {
      const map = await fetchStockMapByWarehouse(so.warehouse);
      setStockMap(map);
    } else {
      setStockMap({});
    }
  };

  const handleScan = async () => {
    if (!selectedSo?.warehouse) {
      setError("Order tidak punya gudang.");
      return;
    }
    try {
      const product = await validateBarcodeScan(scanCode);
      const idx = lines.findIndex((l) => l.product === product.id);
      if (idx < 0) {
        setError(`Produk ${product.sku} tidak ada di order ini.`);
        return;
      }
      const line = lines[idx];
      const nextPicked = line.picked + 1;
      await validatePickingQty(
        selectedSo.warehouse,
        line.product,
        line.name,
        nextPicked,
      );
      const nextLines = lines.map((l, i) => (i === idx ? { ...l, picked: nextPicked } : l));
      setLines(nextLines);

      let wf = mergeOutboundLinesFromSo(
        parseOutboundWorkflow(selectedSo.outbound_workflow_json),
        [],
      );
      const pl = wf.pick?.lines?.[line.product];
      if (pl) {
        wf.pick!.lines[line.product] = { ...pl, qty_picked: nextPicked };
      }
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(selectedSo.id, {
        outbound_workflow_json: serializeOutboundWorkflow(wf),
      });

      setScanCode("");
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const doneCount = lines.filter((l) => l.picked >= l.qty).length;
  const progress = lines.length ? Math.round((doneCount / lines.length) * 100) : 0;

  const loadSoByTracking = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const list = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 30, {
        filter: 'send_to_warehouse_at != ""',
        expand: "warehouse,customer",
      });
      const match = list.items.find((o) => {
        const { shipping } = parseNotesWithShipping(o.notes ?? "");
        return shipping.tracking_no?.trim() === c;
      });
      if (!match) throw new Error("SO dengan nomor lacak ini tidak ditemukan.");
      setEntryMode("tracking_scan");
      await loadOrderLines(match);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const completePicking = async () => {
    if (!selectedSo) return;
    const wf = mergeOutboundLinesFromSo(parseOutboundWorkflow(selectedSo.outbound_workflow_json), []);
    for (const l of lines) {
      const pl = wf.pick?.lines?.[l.product];
      if (pl) wf.pick!.lines[l.product] = { ...pl, qty_picked: l.picked, qty_required: l.qty };
    }
    wf.stage = "pick_pending";
    if (!isPickComplete(wf)) {
      setError("Picking belum lengkap — semua baris harus terpenuhi.");
      return;
    }
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error("Login ulang");
      const { shipping } = parseNotesWithShipping(selectedSo.notes ?? "");
      const updated = await updateSalesWarehouseProcess(selectedSo.id, userId, "complete_pick", {
        entryMode,
        trackingCode: entryMode === "tracking_scan" ? shipping.tracking_no ?? trackScan : undefined,
        userName: pb.authStore.model?.name as string | undefined,
      });
      setBookingNo(updated.wms_booking_no ?? null);
      const acts = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
        filter: `entity_type = "biz_sales_orders" && entity_id = "${selectedSo.id}" && activity_type = "wms.pick_task"`,
        requestKey: null,
      });
      for (const a of acts) {
        const row = a as { id: string; payload?: Record<string, unknown> };
        await pb.collection(INV_COLLECTIONS.staffActivities).update(row.id, {
          payload: { ...(row.payload || {}), status: "done", progress: 100 },
        });
      }
      setError("");
      alert(
        `Picking selesai. Booking: ${updated.wms_booking_no}\nLanjut ke halaman Validasi.`,
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Picking"
        subtitle="Pengeluaran barang (SO) — ambil dari gudang & ruangan yang tertera per baris."
        module="wms"
      >
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <WmsCard>
              <WmsSectionTitle title="Mode" subtitle="Skenario 1 manual / 2 scan resi" />
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEntryMode("manual")}
                  className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "manual" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
                >
                  Manual (daftar SO)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("tracking_scan")}
                  className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "tracking_scan" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
                >
                  Scan no. lacak
                </button>
              </div>
              {entryMode === "tracking_scan" && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder="Scan nomor pelacakan"
                    value={trackScan}
                    onChange={(e) => setTrackScan(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void loadSoByTracking(trackScan)}
                  />
                  <WmsPrimaryButton type="button" onClick={() => void loadSoByTracking(trackScan)}>
                    Cari SO
                  </WmsPrimaryButton>
                </div>
              )}
            </WmsCard>

            <WmsCard>
              <WmsSectionTitle
                title="Antrean pengeluaran (SO)"
                subtitle="Pilih order — barang dikeluarkan dari gudang sumber"
              />
              {loading ? (
                <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-indigo-600" />
              ) : orders.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">Belum ada order aktif.</p>
              ) : (
                <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => void loadOrderLines(o)}
                        className={
                          "w-full rounded-lg border px-3 py-2 text-left text-sm transition " +
                          (selectedSo?.id === o.id
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-200 hover:border-indigo-200")
                        }
                      >
                        <p className="font-mono font-medium text-indigo-700">{o.order_no}</p>
                        <p className="text-xs text-slate-500">
                          Keluar dari:{" "}
                          <span className="font-medium text-slate-700">
                            {o.expand?.warehouse?.name || "Gudang belum dipilih"}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-400">{o.status}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </WmsCard>
          </div>

          <div className="space-y-4 lg:col-span-2">
            {selectedSo ? (
              <>
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                  <p className="font-semibold">Pengeluaran barang (penjualan / SO)</p>
                  <p className="mt-1">
                    Ambil stok dari gudang:{" "}
                    <strong>{selectedSo.expand?.warehouse?.name || "—"}</strong>
                    {" — "}
                    ikuti ruangan per baris di bawah (beda dengan penerimaan PO yang memasukkan barang).
                  </p>
                  {warehouseRoomCount === 0 ? (
                    <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      Belum ada ruangan terdeteksi di gudang ini. Buat di{" "}
                      <Link href="/gudang/lokasi" className="font-semibold underline">
                        Lokasi Ruangan
                      </Link>{" "}
                      lalu tetapkan produk di{" "}
                      <Link href="/gudang/produk" className="font-semibold underline">
                        Daftar Produk
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>

                <WmsCard>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <WmsSectionTitle
                      title={selectedSo.order_no}
                      subtitle={`Gudang sumber: ${selectedSo.expand?.warehouse?.name || "—"}`}
                    />
                    <WmsBadge tone={progress === 100 ? "emerald" : "indigo"}>{progress}%</WmsBadge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                      placeholder="Scan barcode / SKU"
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleScan()}
                    />
                    <WmsPrimaryButton type="button" onClick={() => void handleScan()}>
                      <Scan className="mr-1 inline h-4 w-4" /> Scan
                    </WmsPrimaryButton>
                  </div>
                </WmsCard>

                <WmsCard>
                  <WmsSectionTitle title="Checklist picking" subtitle={`${doneCount}/${lines.length} baris selesai`} />
                  <ul className="mt-4 space-y-2">
                    {lines.map((l, i) => (
                      <li
                        key={l.product}
                        className={
                          "flex items-center gap-3 rounded-xl border px-4 py-3 " +
                          (l.picked >= l.qty ? "border-emerald-200 bg-emerald-50/80" : "border-slate-200")
                        }
                      >
                        <span className="font-mono text-xs text-indigo-600">{l.sku}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{l.name}</p>
                          <p className="text-xs font-medium text-violet-800">
                            {formatPickHintLine(l.pickHint, {
                              noRoomsInWarehouse: warehouseRoomCount === 0,
                            })}
                          </p>
                          <p className="text-xs text-slate-500">
                            Stok di gudang: {formatIntegerId(getStockQtyFromMap(stockMap, l.product))}
                          </p>
                        </div>
                        <span className="text-sm font-semibold">
                          {l.picked}/{l.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {bookingNo && (
                    <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 font-mono text-sm text-violet-900">
                      Booking: {bookingNo} — scan QR di label keranjang
                    </p>
                  )}
                  {progress === 100 && lines.length > 0 ? (
                    <WmsPrimaryButton className="mt-4 w-full" type="button" onClick={() => void completePicking()}>
                      Selesai picking → buat nomor booking
                    </WmsPrimaryButton>
                  ) : null}
                </WmsCard>
              </>
            ) : (
              <WmsCard className="py-12 text-center text-sm text-slate-500">
                Pilih sales order di kiri untuk mulai picking.
              </WmsCard>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <WmsNavTile href="/wms/validasi" label="Lanjut validasi" icon={ShoppingCart} accent="violet" />
          <WmsNavTile href="/wms/packing" label="Packing" icon={ShoppingCart} accent="pink" />
          <WmsNavTile href="/wms/pickup" label="Ready pickup" icon={ShoppingCart} accent="emerald" />
          <Link href="/gudang/stok" className="text-sm font-medium text-indigo-600 hover:underline">
            Lihat stok global →
          </Link>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}
