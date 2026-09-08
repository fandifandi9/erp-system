"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Scan, X } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  WmsCard,
  WmsPrimaryButton,
  WmsSectionTitle,
  WmsBadge,
} from "@/components/wms/ui";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { fetchStockMapForProducts, getStockQtyFromMap } from "@/lib/wms/stock";
import { validateBarcodeScan, validatePickingQty } from "@/lib/wms/validations";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/client";
import { formatIntegerId } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import {
  fetchProductPickHints,
  type ProductPickHint,
} from "@/lib/wms/product-placement-client";
import { formatPickHintLineLocalized } from "@/lib/i18n/wms-formatters";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  syncPickLinesFromUi,
  isPickComplete,
  filterSalesOrdersForPickingQueue,
  canCancelFromPicking,
  getOutboundStageFromSo,
} from "@/lib/wms/outbound-workflow";
import { mergeOutboundWorkflowForOrder } from "@/lib/wms/merge-outbound-workflow-client";
import { WmsOrderHeader } from "@/components/wms/WmsOrderHeader";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { getPkFromSo, getPkIdentityView } from "@/lib/wms/pk-identity";
import {
  fetchRequiresSerialMap,
  isPickSerialsComplete,
} from "@/lib/wms/serial-numbers";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { findSalesOrderByScanRef } from "@/lib/wms/outbound-order-lookup";
import { getAutoPrintPkEnabled } from "@/lib/wms/picking-preferences";
import {
  autoPrintPkForOrder,
  autoPrintPkForOrders,
} from "@/lib/wms/auto-print-pk-queue";
import { wasPkAutoPrinted, markPkAutoPrinted } from "@/lib/wms/pk-print-tracker";
import { printPkForSalesOrder, printPksForSalesOrders } from "@/lib/wms/print-pk-for-order";
import { useOutboundOrderFromQuery } from "@/lib/wms/use-outbound-order-from-query";
import { usePickingModeApi } from "@/components/wms/PickingModeToolbar";

type PickLine = {
  product: string;
  sku: string;
  name: string;
  qty: number;
  picked: number;
  pickHint?: ProductPickHint;
  requiresSerial: boolean;
  serials: string[];
  forBundleLabel?: string;
};

function countFilledSerials(l: PickLine): number {
  let n = 0;
  for (let i = 0; i < l.picked; i++) {
    if (l.serials[i]?.trim()) n++;
  }
  return n;
}

/** SN kosong pada unit yang sudah dipetik — wajib diisi sebelum scan produk lagi. */
function findPendingSn(lines: PickLine[]): { line: PickLine; serialIdx: number } | null {
  for (const l of lines) {
    if (!l.requiresSerial || l.picked <= 0) continue;
    for (let i = 0; i < l.picked; i++) {
      if (!l.serials[i]?.trim()) return { line: l, serialIdx: i };
    }
  }
  return null;
}

function pickedSerialsComplete(l: PickLine): boolean {
  if (!l.requiresSerial) return true;
  for (let i = 0; i < l.picked; i++) {
    if (!l.serials[i]?.trim()) return false;
  }
  return true;
}

function lineFullyReady(l: PickLine): boolean {
  if (l.picked < l.qty) return false;
  if (!l.requiresSerial) return true;
  for (let i = 0; i < l.qty; i++) {
    if (!l.serials[i]?.trim()) return false;
  }
  return true;
}

export default function WmsPickingPage() {
  const { t } = useLocale();
  const pickingMode = usePickingModeApi();
  const { entryMode, setEntryMode, autoPrintPk, registerFindSo } = pickingMode;
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<PickLine[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [scanCode, setScanCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouseRoomCount, setWarehouseRoomCount] = useState<number | null>(null);
  const [pickWarehouseName, setPickWarehouseName] = useState<string>("");
  const [assigningPk, setAssigningPk] = useState(false);
  const [printSelIds, setPrintSelIds] = useState<string[]>([]);
  const [printingManual, setPrintingManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Umpan balik singkat per scan: hijau 100% = cocok, merah X = salah. */
  const [scanFeedback, setScanFeedback] = useState<"ok" | "err" | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const scanFeedbackTimerRef = useRef<number | null>(null);
  /** True bila user sudah pick/scan di sesi order ini — pemicu auto-complete saat 100%. */
  const pickedSinceLoadRef = useRef(false);
  const autoCompletingRef = useRef(false);
  /** Cermin state lines terbaru — dipakai handler onBlur SN. */
  const linesRef = useRef<PickLine[]>([]);
  /** Fokus otomatis setelah render (scan → SN, SN → scan berikutnya). */
  const pendingFocusRef = useRef<
    { kind: "sn"; productId: string; serialIdx: number } | { kind: "scan" } | null
  >(null);
  const selectedSoRef = useRef<SalesOrder | null>(null);
  selectedSoRef.current = selectedSo;
  const autoPrintPrevRef = useRef(autoPrintPk);

  useEffect(() => {
    return () => {
      if (scanFeedbackTimerRef.current) window.clearTimeout(scanFeedbackTimerRef.current);
    };
  }, []);

  const focusScanInput = () => {
    const el = document.querySelector<HTMLInputElement>("[data-scan-input]");
    el?.focus();
    el?.select();
  };

  const focusSnInput = (productId: string, serialIdx: number) => {
    const input = document.querySelector<HTMLInputElement>(
      `input[data-sn-input][data-sn-product="${productId}"][data-sn-index="${serialIdx}"]`,
    );
    if (input) {
      input.focus();
      input.select();
      input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return true;
    }
    return false;
  };

  const queueFocus = (target: NonNullable<typeof pendingFocusRef.current>) => {
    pendingFocusRef.current = target;
  };

  /** Terapkan fokus antrian setelah DOM checklist ter-update. */
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;

    const run = (attempt = 0) => {
      const target = pendingFocusRef.current;
      if (!target) return;

      let ok = false;
      if (target.kind === "scan") {
        focusScanInput();
        ok = document.activeElement?.matches("[data-scan-input]") ?? false;
      } else {
        ok = focusSnInput(target.productId, target.serialIdx);
      }

      if (ok || attempt >= 4) {
        pendingFocusRef.current = null;
        return;
      }
      requestAnimationFrame(() => run(attempt + 1));
    };

    run();
  }, [lines]);

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      let queue = filterSalesOrdersForPickingQueue(res.items);
      const userId = pb.authStore.model?.id;
      const userName =
        typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined;
      if (userId && getAutoPrintPkEnabled()) {
        const { orders: printedQueue, updated } = await autoPrintPkForOrders(queue, {
          userId,
          userName,
          knownOrderIds: knownOrderIdsRef.current,
        });
        queue = printedQueue;
        if (updated.size > 0 && selectedSoRef.current) {
          const refreshed = updated.get(selectedSoRef.current.id);
          if (refreshed) setSelectedSo(refreshed);
        }
      }
      for (const o of queue) knownOrderIdsRef.current.add(o.id);
      setOrders(queue);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useOutboundOrderFromQuery(orders, loading, selectedSo?.id, loadOrderLines);

  useEffect(() => {
    if (!autoPrintPk) return;
    const timer = window.setInterval(() => {
      void loadOrders({ silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoPrintPk, loadOrders]);

  // Function declaration (bukan const) agar ter-hoist — dipakai oleh
  // useOutboundOrderFromQuery di atas sebelum baris definisi ini.
  async function loadOrderLines(so: SalesOrder) {
    setError("");
    setAssigningPk(false);
    // Order baru dibuka — reset pemicu auto-complete (jangan auto-selesai saat load).
    pickedSinceLoadRef.current = false;
    autoCompletingRef.current = false;
    setScanFeedback(null);
    setScanCode("");
    let activeSo = so;
    const userId = pb.authStore.model?.id;
    if (userId && !getPkFromSo(so)) {
      setAssigningPk(true);
      try {
        activeSo = await updateSalesWarehouseProcess(so.id, userId, "start_picking", {
          userName:
            typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
        });
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setAssigningPk(false);
      }
    }
    setSelectedSo(activeSo);
    const wfBase = parseOutboundWorkflow(activeSo.outbound_workflow_json);
    const wf = await mergeOutboundWorkflowForOrder(activeSo.id, wfBase);
    const wfJson = serializeOutboundWorkflow(wf);
    if (wfJson !== activeSo.outbound_workflow_json) {
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(activeSo.id, {
        outbound_workflow_json: wfJson,
      });
      activeSo = { ...activeSo, outbound_workflow_json: wfJson };
    }

    const pickEntries = Object.values(wf.pick?.lines ?? {});
    const productIds = pickEntries.map((l) => l.product_id).filter(Boolean);
    let hints: Record<string, ProductPickHint> = {};
    setWarehouseRoomCount(null);
    setPickWarehouseName(activeSo.expand?.warehouse?.name?.trim() ?? "");
    if (activeSo.warehouse && productIds.length > 0) {
      const placement = await fetchProductPickHints(activeSo.warehouse, productIds);
      hints = placement.hints;
      setWarehouseRoomCount(placement.roomCount);
      if (placement.warehouseName) {
        setPickWarehouseName(placement.warehouseName);
      }
      if (placement.error) {
        setError(placement.error);
      }
    }
    const requiresMap = await fetchRequiresSerialMap(productIds);
    // Selalu MULAI DARI 0 saat order dibuka — wajib scan ulang dari awal.
    // Hindari kondisi "menggantung" (mis. picked 1/1 tapi SN kosong dari sesi sebelumnya).
    setLines(
      pickEntries.map((pl) => ({
        product: pl.product_id,
        sku: pl.sku || "—",
        name: pl.name || pl.product_id,
        qty: pl.qty_required,
        picked: 0,
        pickHint: hints[pl.product_id],
        requiresSerial: !!requiresMap[pl.product_id],
        serials: [],
        forBundleLabel: pl.for_bundle_label,
      })),
    );
    if (activeSo.warehouse && productIds.length > 0) {
      const map = await fetchStockMapForProducts(activeSo.warehouse, productIds);
      setStockMap(map);
    } else {
      setStockMap({});
    }

    if (
      userId &&
      getAutoPrintPkEnabled() &&
      getPkFromSo(activeSo) &&
      !wasPkAutoPrinted(activeSo.id)
    ) {
      try {
        const printed = await autoPrintPkForOrder(activeSo, {
          userId,
          userName:
            typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
        });
        activeSo = printed;
        setSelectedSo(printed);
        setOrders((prev) => prev.map((o) => (o.id === printed.id ? printed : o)));
      } catch (e) {
        setError(getErrorMessage(e));
      }
    }
  }

  const cancelPickingOrder = async () => {
    if (!selectedSo) return;
    const reason = window.prompt(t("wms.picking.promptCancel"));
    if (reason === null) return;
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.picking.errRelogin"));
      await updateSalesWarehouseProcess(selectedSo.id, userId, "cancel_order", {
        note: reason,
        userName: typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
      });
      setSelectedSo(null);
      setLines([]);
      await loadOrders();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  /** Tampilkan tanda hijau/merah lalu kosongkan kolom scan agar siap kode berikutnya. */
  const flashScanFeedback = (status: "ok" | "err", focusScan = true) => {
    if (scanFeedbackTimerRef.current) window.clearTimeout(scanFeedbackTimerRef.current);
    setScanFeedback(status);
    setScanCode("");
    scanFeedbackTimerRef.current = window.setTimeout(() => {
      setScanFeedback(null);
      scanFeedbackTimerRef.current = null;
    }, 1200);
    if (focusScan) {
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-scan-input]")?.focus();
      }, 60);
    }
  };

  const handleScan = async () => {
    const code = scanCode.trim();
    if (!code) return;
    if (!selectedSo?.warehouse) {
      setError(t("wms.permintaan.errNoWarehouse"));
      flashScanFeedback("err");
      return;
    }
    try {
      // Wajib SN: selesaikan SN unit yang sudah dipetik dulu (mis. 10 pcs → 10× scan + 10× SN).
      const pendingSn = findPendingSn(lines);
      if (pendingSn) {
        setError(
          t("wms.picking.errSnFirst", {
            name: pendingSn.line.name,
            n: formatIntegerId(pendingSn.serialIdx + 1),
          }),
        );
        flashScanFeedback("err", false);
        queueFocus({
          kind: "sn",
          productId: pendingSn.line.product,
          serialIdx: pendingSn.serialIdx,
        });
        requestAnimationFrame(() => {
          focusSnInput(pendingSn.line.product, pendingSn.serialIdx);
        });
        return;
      }

      const product = await validateBarcodeScan(code);
      const idx = lines.findIndex((l) => l.product === product.id);
      if (idx < 0) {
        setError(t("wms.validasi.errSkuNotInOrder", { sku: product.sku }));
        flashScanFeedback("err");
        return;
      }
      const line = lines[idx];
      // Cegah over-scan: tidak boleh melebihi jumlah yang diminta.
      if (line.picked >= line.qty) {
        setError(t("wms.picking.errAlreadyFull", { name: line.name }));
        flashScanFeedback("err");
        return;
      }
      const nextPicked = line.picked + 1;
      await validatePickingQty(
        selectedSo.warehouse,
        line.product,
        line.name,
        nextPicked,
      );
      const nextLines = lines.map((l, i) => (i === idx ? { ...l, picked: nextPicked } : l));
      const scannedLine = nextLines[idx]!;
      pickedSinceLoadRef.current = true;

      // Antrian fokus SEBELUM setLines agar useLayoutEffect menangkap SN yang baru muncul.
      if (scannedLine.requiresSerial) {
        queueFocus({ kind: "sn", productId: line.product, serialIdx: nextPicked - 1 });
      } else {
        queueFocus({ kind: "scan" });
      }

      setLines(nextLines);
      void persistLines(nextLines);

      setError("");
      flashScanFeedback("ok", false);
      maybeAutoComplete(nextLines);
    } catch (e) {
      setError(getErrorMessage(e));
      flashScanFeedback("err");
    }
  };

  /** Setelah scan SN (Enter) → kembali ke scan produk (unit berikutnya). */
  const focusAfterSnEnter = () => {
    focusScanInput();
    maybeAutoComplete(linesRef.current);
  };

  const lineReady = lineFullyReady;

  const doneCount = lines.filter(lineReady).length;
  const progress = lines.length ? Math.round((doneCount / lines.length) * 100) : 0;
  linesRef.current = lines;

  const updateSerial = (idx: number, serialIdx: number, value: string) => {
    pickedSinceLoadRef.current = true;
    const next = lines.map((l, i) => {
      if (i !== idx) return l;
      const serials = [...l.serials];
      while (serials.length < l.qty) serials.push("");
      serials[serialIdx] = value;
      return { ...l, serials };
    });
    setLines(next);
    void persistLines(next);
    // Auto-selesai TIDAK dipicu per-ketikan SN (biar SN tak terpotong).
    // Dipicu saat SN kehilangan fokus (onBlur) atau Enter.
  };

  const persistLines = async (nextLines: PickLine[]) => {
    if (!selectedSo) return;
    const wf = syncPickLinesFromUi(
      parseOutboundWorkflow(selectedSo.outbound_workflow_json),
      nextLines.map((l) => ({
        product: l.product,
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        picked: l.picked,
        serial_numbers: l.serials,
      })),
    );
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(selectedSo.id, {
      outbound_workflow_json: serializeOutboundWorkflow(wf),
    });
    setSelectedSo({ ...selectedSo, outbound_workflow_json: serializeOutboundWorkflow(wf) });
  };

  const loadSoByTracking = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const match = await findSalesOrderByScanRef(c);
      if (!match) throw new Error(t("wms.picking.errSoNotFound"));
      setEntryMode("tracking_scan");
      await loadOrderLines(match);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [t, setEntryMode]);

  useEffect(() => {
    registerFindSo((code) => void loadSoByTracking(code));
    return () => registerFindSo(null);
  }, [registerFindSo, loadSoByTracking]);

  useEffect(() => {
    if (autoPrintPk && !autoPrintPrevRef.current) {
      void loadOrders({ silent: true });
    }
    autoPrintPrevRef.current = autoPrintPk;
  }, [autoPrintPk, loadOrders]);

  const printOneOrder = async (o: SalesOrder) => {
    try {
      const ok = await printPkForSalesOrder(o);
      if (ok) markPkAutoPrinted(o.id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      await loadOrders({ silent: true });
    }
  };

  const togglePrintSelect = (o: SalesOrder) => {
    setPrintSelIds((prev) =>
      prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
    );
  };

  const selectAllPrint = (ids: string[], selectAll: boolean) => {
    setPrintSelIds(selectAll ? ids : []);
  };

  const printSelectedOrders = async () => {
    if (printSelIds.length === 0 || printingManual) return;
    setPrintingManual(true);
    try {
      // Cetak semua PK terpilih dalam SATU dialog cetak (bukan satu per satu).
      const selected = printSelIds
        .map((id) => orders.find((x) => x.id === id))
        .filter((o): o is SalesOrder => !!o);
      const printed = await printPksForSalesOrders(selected);
      for (const o of printed) markPkAutoPrinted(o.id);
      setPrintSelIds([]);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPrintingManual(false);
      await loadOrders({ silent: true });
    }
  };

  const completePicking = async (opts?: { auto?: boolean; linesOverride?: PickLine[] }) => {
    if (!selectedSo) return;
    const effLines = opts?.linesOverride ?? lines;
    // PENTING: PickLine memakai field `serials`, tapi syncPickLinesFromUi membaca
    // `serial_numbers`. Petakan agar SN yang baru diisi ikut terbaca (bukan data lama).
    const uiLines = effLines.map((l) => ({
      product: l.product,
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      picked: l.picked,
      serial_numbers: l.serials,
    }));
    const wf = syncPickLinesFromUi(parseOutboundWorkflow(selectedSo.outbound_workflow_json), uiLines);
    if (!isPickComplete(wf)) {
      setError(t("wms.permintaan.errPickingIncomplete"));
      return;
    }
    const requiresMap = Object.fromEntries(effLines.map((l) => [l.product, l.requiresSerial]));
    const wfForSn = syncPickLinesFromUi(wf, uiLines);
    if (!isPickSerialsComplete(wfForSn, requiresMap)) {
      setError(t("wms.picking.errSerialIncomplete"));
      return;
    }
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.picking.errRelogin"));
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(selectedSo.id, {
        outbound_workflow_json: serializeOutboundWorkflow(wf),
      });
      const updated = await updateSalesWarehouseProcess(selectedSo.id, userId, "complete_pick", {
        entryMode,
        userName: pb.authStore.model?.name as string | undefined,
      });
      const finishedSoId = selectedSo.id;
      const pkDone = getPkIdentityView(updated);
      setSelectedSo(null);
      setLines([]);
      setScanCode("");
      try {
        const acts = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
          filter: `entity_type = "biz_sales_orders" && entity_id = "${finishedSoId}" && activity_type = "wms.pick_task"`,
          requestKey: null,
        });
        for (const a of acts) {
          const row = a as { id: string; payload?: Record<string, unknown> };
          await pb.collection(INV_COLLECTIONS.staffActivities).update(row.id, {
            payload: { ...(row.payload || {}), status: "done" },
          });
        }
      } catch {
        /* audit task opsional — jangan blokir alur validasi */
      }
      setError("");
      // Tetap di halaman Picking — order sudah dikirim ke Packing & QC. Notif singkat + siap order berikutnya.
      setNotice(t("wms.picking.completeNotice", { pk: pkDone.pkNo }));
      window.setTimeout(() => setNotice(null), 4500);
      await loadOrders();
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-track-input]")?.focus();
      }, 80);
    } catch (e) {
      autoCompletingRef.current = false; // gagal — izinkan coba lagi (manual/otomatis)
      setError(getErrorMessage(e));
    }
  };

  /**
   * Picu auto-selesai secara deterministik dari aksi scan/isi SN.
   * Dipanggil dengan daftar baris terbaru (bukan bergantung state async/effect).
   */
  const maybeAutoComplete = (lns: PickLine[]) => {
    if (!selectedSo || lns.length === 0) return;
    if (!pickedSinceLoadRef.current) return;
    if (autoCompletingRef.current) return;
    if (!lns.every(lineReady)) return; // semua baris harus lengkap (qty + SN)
    autoCompletingRef.current = true;
    window.setTimeout(() => {
      void completePicking({ auto: true, linesOverride: lns });
    }, 500);
  };

  return (
    <>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="grid h-[calc(100dvh-10.5rem)] min-h-[32rem] grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex min-h-0 flex-col">
            <OutboundOrderQueue
              fillHeight
              title={t("wms.picking.pkQueueTitle")}
              subtitle={t("wms.picking.pkQueueSubtitle")}
              orders={orders}
              selectedId={selectedSo?.id}
              loading={loading}
              emptyText={t("wms.picking.queueEmpty")}
              onSelect={(o) => void loadOrderLines(o)}
              onRefresh={() => void loadOrders()}
              onPrintOrder={(o) => void printOneOrder(o)}
              printSelectable
              printSelectedIds={printSelIds}
              onTogglePrintSelect={togglePrintSelect}
              onSelectAllPrint={selectAllPrint}
              onPrintSelected={() => void printSelectedOrders()}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
            {selectedSo ? (
              <div className="shrink-0">
                <WmsOrderHeader so={selectedSo} />
              </div>
            ) : null}

            {selectedSo ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <WmsCard className="shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <WmsSectionTitle
                      title={(() => {
                        const pk = getPkIdentityView(selectedSo);
                        return pk.pkNo !== "—"
                          ? t("wms.picking.pkTitle", { pk: pk.pkNo })
                          : t("wms.picking.pkNotCreated");
                      })()}
                      subtitle={t("wms.picking.soSubtitle", {
                        order: selectedSo.order_no,
                        warehouse: selectedSo.expand?.warehouse?.name || "—",
                      })}
                    />
                    <WmsBadge tone={progress === 100 ? "emerald" : "indigo"}>{progress}%</WmsBadge>
                  </div>
                  <div className="mt-3 flex items-stretch gap-2">
                    <input
                      data-scan-input
                      autoFocus
                      className={
                        "flex-1 rounded-xl border px-4 py-3 font-mono text-sm transition-colors " +
                        (scanFeedback === "ok"
                          ? "border-emerald-400 bg-emerald-50"
                          : scanFeedback === "err"
                            ? "border-red-400 bg-red-50"
                            : "border-slate-200")
                      }
                      placeholder={t("wms.picking.scanPlaceholder")}
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleScan()}
                      aria-invalid={scanFeedback === "err"}
                    />
                    <WmsPrimaryButton type="button" onClick={() => void handleScan()}>
                      <Scan className="mr-1 inline h-4 w-4" /> {t("wms.picking.scanBtn")}
                    </WmsPrimaryButton>
                    {scanFeedback === "ok" ? (
                      <div
                        className="flex w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-sm"
                        aria-label={t("wms.picking.scanOk")}
                      >
                        100%
                      </div>
                    ) : scanFeedback === "err" ? (
                      <div
                        className="flex w-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm"
                        aria-label={t("wms.picking.scanErr")}
                      >
                        <X className="h-7 w-7" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-[4.5rem] shrink-0" aria-hidden />
                    )}
                  </div>
                </WmsCard>

                <WmsCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <WmsSectionTitle
                    title={t("wms.picking.checklistTitle")}
                    subtitle={t("wms.picking.checklistSubtitle", { done: doneCount, total: lines.length })}
                  />
                  <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {lines.map((l, i) => {
                      const needsSn =
                        l.requiresSerial && l.picked > 0 && !pickedSerialsComplete(l);
                      const snFilled = countFilledSerials(l);
                      const pickRemaining = Math.max(0, l.qty - l.picked);
                      return (
                      <li
                        key={l.product}
                        className={
                          "flex items-center gap-3 rounded-xl border px-4 py-3 " +
                          (needsSn
                            ? "border-amber-400 bg-amber-50/90 ring-2 ring-amber-200"
                            : l.picked >= l.qty
                              ? "border-emerald-200 bg-emerald-50/80"
                              : "border-slate-200")
                        }
                      >
                        <span className="font-mono text-xs text-indigo-600">{l.sku}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{l.name}</p>
                          {l.forBundleLabel ? (
                            <p className="text-[11px] font-medium text-amber-800">
                              {t("wms.picking.bundleFor", { label: l.forBundleLabel })}
                            </p>
                          ) : null}
                          {(() => {
                            const hintLine = formatPickHintLineLocalized(t, l.pickHint, {
                              warehouseName: pickWarehouseName || selectedSo.expand?.warehouse?.name,
                            });
                            return hintLine ? (
                              <p className="text-xs font-medium text-violet-800">{hintLine}</p>
                            ) : null;
                          })()}
                          <p className="text-sm font-semibold text-slate-800">
                            {t("wms.picking.qtyRequested", {
                              qty: formatIntegerId(l.qty),
                            })}
                          </p>
                          {l.qty > 1 && l.picked < l.qty && pickedSerialsComplete(l) ? (
                            <p className="text-xs font-medium text-indigo-700">
                              {t("wms.picking.scanMore", { remaining: formatIntegerId(pickRemaining) })}
                            </p>
                          ) : null}
                          {l.requiresSerial && l.picked > 0 ? (
                            <p className="text-xs font-medium text-amber-900">
                              {t("wms.picking.snProgress", {
                                done: formatIntegerId(snFilled),
                                total: formatIntegerId(l.picked),
                                required: formatIntegerId(l.qty),
                              })}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            {t("wms.picking.stockInWarehouse", {
                              qty: formatIntegerId(getStockQtyFromMap(stockMap, l.product)),
                            })}
                          </p>
                          {l.requiresSerial && l.picked > 0 ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] font-semibold uppercase text-amber-800">
                                {t("wms.picking.serialRequired")}
                              </p>
                              {Array.from({ length: l.picked }, (_, si) => (
                                <input
                                  key={`${l.product}-sn-${si}`}
                                  data-sn-input
                                  data-sn-product={l.product}
                                  data-sn-index={si}
                                  autoFocus={needsSn && si === l.picked - 1 && !l.serials[si]?.trim()}
                                  className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 font-mono text-sm ring-amber-200 focus:border-amber-500 focus:outline-none focus:ring-2"
                                  placeholder={t("wms.picking.serialPlaceholder", { n: si + 1 })}
                                  value={l.serials[si] ?? ""}
                                  onChange={(e) => updateSerial(i, si, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      focusAfterSnEnter();
                                    }
                                  }}
                                  onBlur={() => maybeAutoComplete(linesRef.current)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {t("wms.picking.pickedLabel")}
                          </span>
                          <span
                            className={
                              "text-base font-bold tabular-nums " +
                              (l.picked >= l.qty ? "text-emerald-600" : "text-slate-900")
                            }
                          >
                            {l.picked}/{l.qty}
                          </span>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 shrink-0 border-t border-slate-100 pt-3">
                  {(() => {
                    const pk = getPkIdentityView(selectedSo);
                    if (pk.pkNo === "—") return null;
                    return (
                      <p className="rounded-lg bg-violet-50 px-3 py-2 font-mono text-sm text-violet-900">
                        {t("wms.picking.pkScanHint", { pk: pk.pkNo })}
                      </p>
                    );
                  })()}
                  {progress === 100 && lines.length > 0 ? (
                    <div className="mt-3">
                    <WmsPrimaryButton type="button" onClick={() => void completePicking()}>
                      {t("wms.picking.completeBtn")}
                    </WmsPrimaryButton>
                    </div>
                  ) : null}
                  {canCancelFromPicking(getOutboundStageFromSo(selectedSo)) ? (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      onClick={() => void cancelPickingOrder()}
                    >
                      {t("wms.picking.cancelOrder")}
                    </button>
                  ) : null}
                  </div>
                </WmsCard>
              </div>
            ) : (
              <WmsCard className="flex flex-1 items-center justify-center text-center text-sm text-slate-500">
                {t("wms.picking.selectOrder")}
              </WmsCard>
            )}
          </div>
        </div>

    </>
  );
}
