"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BARCODE_SYMBOLOGY_OPTIONS,
  buildJob,
  downloadBarcodeLabels,
  generateBarcodeDataUrl,
  isCode128Safe,
  isItfSafe,
  isUpcASafe,
  normalizeEncodeValue,
  parseSymbologyParam,
  printBarcodeLabels,
  SHEET_PAPERS,
  sheetGrid,
  symbologyLabel,
  type BarcodeLabelItem,
  type BarcodeSymbology,
  type PaperKind,
} from "@/lib/inventory/barcode-label-engine";
import {
  fetchPendingReceivingLabelRequests,
  markReceivingLineLabelPrinted,
  type ReceivingLabelRequest,
} from "@/lib/wms/receiving-label-queue";
import { getErrorMessage } from "@/lib/errors";
import {
  Barcode,
  Download,
  Loader2,
  Package,
  PenLine,
  Printer,
  QrCode,
} from "lucide-react";
import Link from "next/link";
import {
  ADD_LABEL_SIZE_ID,
  appendCustomLabelSize,
  builtinLabelSizeOptions,
  clampLabelMm,
  findSizeOption,
  loadCustomLabelSizes,
  mergeLabelSizeOptions,
  removeCustomLabelSize,
  type LabelSizeOption,
} from "@/lib/inventory/barcode-label-sizes";

type Tab = "receiving" | "manual";

const defaultManual = () => ({
  encodeValue: "",
  title: "",
});

export function BarcodeLabelStudio() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("receiving");
  const [receivingRequests, setReceivingRequests] = useState<ReceivingLabelRequest[]>([]);
  const [loadingReceiving, setLoadingReceiving] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ReceivingLabelRequest | null>(null);
  const [manual, setManual] = useState(defaultManual);
  const [queue, setQueue] = useState<BarcodeLabelItem[]>([]);

  const [paper, setPaper] = useState<PaperKind>("thermal");
  const [customSizes, setCustomSizes] = useState<LabelSizeOption[]>([]);
  const [selectedSizeId, setSelectedSizeId] = useState("builtin-40x30");
  const [draftW, setDraftW] = useState("30");
  const [draftH, setDraftH] = useState("20");
  const [symbology, setSymbology] = useState<BarcodeSymbology>("code128");
  const [copies, setCopies] = useState(1);
  const [showTitle, setShowTitle] = useState(true);
  const [showCode, setShowCode] = useState(true);

  const [previewImg, setPreviewImg] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pkg = searchParams.get("pkg")?.trim();
    if (!pkg) return;
    const order = searchParams.get("order")?.trim();
    const sym = searchParams.get("sym");
    setTab("manual");
    setManual({
      encodeValue: pkg,
      title: order ?? "Package Code",
    });
    const parsedSym = parseSymbologyParam(sym);
    setSymbology(parsedSym);
    setShowTitle(true);
    setShowCode(parsedSym !== "qr");
  }, [searchParams]);

  const sizeOptions = useMemo(
    () => mergeLabelSizeOptions(customSizes),
    [customSizes],
  );

  const selectedSize = useMemo(
    () => findSizeOption(sizeOptions, selectedSizeId),
    [sizeOptions, selectedSizeId],
  );

  const isAddingSize = selectedSizeId === ADD_LABEL_SIZE_ID;

  const labelDims = useMemo(() => {
    if (isAddingSize) {
      return {
        widthMm: clampLabelMm(Number(draftW), 30),
        heightMm: clampLabelMm(Number(draftH), 20),
      };
    }
    if (selectedSize) {
      return { widthMm: selectedSize.widthMm, heightMm: selectedSize.heightMm };
    }
    const fallback = builtinLabelSizeOptions()[2];
    return { widthMm: fallback.widthMm, heightMm: fallback.heightMm };
  }, [selectedSize, isAddingSize, draftW, draftH]);

  const sheetInfo = useMemo(() => {
    if (paper === "thermal") return null;
    const sheet = SHEET_PAPERS.find((s) => s.id === paper);
    if (!sheet) return null;
    return sheetGrid(sheet, labelDims);
  }, [paper, labelDims]);

  const activeItem = useMemo((): BarcodeLabelItem | null => {
    if (tab === "receiving" && selectedRequest) return selectedRequest.item;
    if (tab === "manual" && manual.encodeValue.trim()) {
      return {
        encodeValue: manual.encodeValue.trim(),
        title: manual.title.trim() || undefined,
      };
    }
    return null;
  }, [tab, selectedRequest, manual]);

  const activeReceivingRefs = useMemo((): ReceivingLabelRequest[] => {
    if (tab === "receiving" && selectedRequest) return [selectedRequest];
    return [];
  }, [tab, selectedRequest]);

  const effectiveCopies = useMemo(() => {
    if (tab === "receiving" && selectedRequest) return selectedRequest.qty;
    return copies;
  }, [tab, selectedRequest, copies]);

  const loadReceivingRequests = useCallback(async () => {
    setLoadingReceiving(true);
    try {
      const items = await fetchPendingReceivingLabelRequests();
      setReceivingRequests(items);
      setSelectedRequest((prev) => {
        if (!prev) return null;
        return items.find((r) => r.lineId === prev.lineId && r.poId === prev.poId) ?? null;
      });
    } catch {
      setReceivingRequests([]);
      setSelectedRequest(null);
    } finally {
      setLoadingReceiving(false);
    }
  }, []);

  useEffect(() => {
    void loadReceivingRequests();
  }, [loadReceivingRequests]);

  useEffect(() => {
    if (!activeItem?.encodeValue) {
      setPreviewImg("");
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void (async () => {
      try {
        const v = normalizeEncodeValue(activeItem.encodeValue);
        const img = await generateBarcodeDataUrl(v, symbology, {
          barHeight: symbology === "qr" ? (labelDims.heightMm <= 20 ? 120 : 160) : labelDims.heightMm <= 20 ? 32 : 40,
        });
        if (!cancelled) setPreviewImg(img);
      } catch {
        if (!cancelled) setPreviewImg("");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeItem?.encodeValue, symbology, labelDims]);

  const validateItem = (item: BarcodeLabelItem) => {
    const v = normalizeEncodeValue(item.encodeValue);
    if (symbology === "code128" && !isCode128Safe(v)) {
      throw new Error("Code128: gunakan huruf/angka standar tanpa aksen.");
    }
    if (symbology === "upca" && !isUpcASafe(v)) {
      throw new Error("UPC-A harus tepat 12 digit angka.");
    }
    if (symbology === "itf" && !isItfSafe(v)) {
      throw new Error("ITF: angka saja, panjang genap (mis. 10 atau 14 digit).");
    }
  };

  const makeJob = (items: BarcodeLabelItem[]) =>
    buildJob(items, {
      copiesPerItem: tab === "receiving" ? 1 : copies,
      paper,
      label: labelDims,
      symbology,
      showTitle,
      showCode,
    });

  const completeReceivingPrint = async (refs: ReceivingLabelRequest[]) => {
    for (const ref of refs) {
      await markReceivingLineLabelPrinted(ref.poId, ref.lineId, ref.qty);
    }
    await loadReceivingRequests();
    setSelectedRequest(null);
  };

  const addToQueue = () => {
    if (!activeItem) {
      alert("Pilih produk atau isi kode.");
      return;
    }
    try {
      validateItem(activeItem);
      setQueue((prev) => [...prev, activeItem]);
    } catch (e) {
      alert(getErrorMessage(e));
    }
  };

  const runPrint = async (
    items: BarcodeLabelItem[],
    receivingRefs: ReceivingLabelRequest[] = [],
  ) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await printBarcodeLabels(makeJob(items));
      setBusy(false);
      if (receivingRefs.length > 0) {
        void completeReceivingPrint(receivingRefs).catch((e) => {
          alert(getErrorMessage(e, "Cetak OK tetapi gagal menandai permintaan selesai"));
        });
      }
    } catch (e) {
      alert(getErrorMessage(e, "Gagal cetak"));
      setBusy(false);
    }
  };

  const runDownloadPdf = async (
    items: BarcodeLabelItem[],
    receivingRefs: ReceivingLabelRequest[] = [],
  ) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await downloadBarcodeLabels(makeJob(items), "pdf");
      if (receivingRefs.length > 0) {
        await completeReceivingPrint(receivingRefs);
      }
    } catch (e) {
      alert(getErrorMessage(e, "Gagal unduh PDF"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setCustomSizes(loadCustomLabelSizes());
  }, []);

  const handleSizeSelect = (id: string) => {
    setSelectedSizeId(id);
    if (id === ADD_LABEL_SIZE_ID) return;
    const opt = findSizeOption(sizeOptions, id);
    if (opt) {
      setDraftW(String(opt.widthMm));
      setDraftH(String(opt.heightMm));
    }
  };

  const saveNewSize = () => {
    const w = clampLabelMm(Number(draftW), 30);
    const h = clampLabelMm(Number(draftH), 20);
    const { custom, added } = appendCustomLabelSize(customSizes, w, h);
    setCustomSizes(custom);
    setSelectedSizeId(added.id);
    setDraftW(String(added.widthMm));
    setDraftH(String(added.heightMm));
  };

  const removeSelectedCustom = () => {
    if (!selectedSize?.isCustom) return;
    const next = removeCustomLabelSize(customSizes, selectedSize.id);
    setCustomSizes(next);
    const first = mergeLabelSizeOptions(next)[0];
    if (first) {
      setSelectedSizeId(first.id);
      setDraftW(String(first.widthMm));
      setDraftH(String(first.heightMm));
    }
  };

  const paperLabel = useMemo(() => {
    if (paper === "thermal") return "Printer termal (stiker langsung)";
    return SHEET_PAPERS.find((s) => s.id === paper)?.label ?? paper;
  }, [paper]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("receiving")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "receiving" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Package className="h-4 w-4" />
            Penerimaan barang
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "manual" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <PenLine className="h-4 w-4" />
            Manual
          </button>
        </div>

        {tab === "receiving" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Permintaan cetak label</p>
              <button
                type="button"
                onClick={() => void loadReceivingRequests()}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Muat ulang
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Dari PO yang sedang diproses di penerimaan — jumlah stiker mengikuti qty barang masuk.
              Setelah dicetak, permintaan hilang dari daftar.
            </p>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
              {loadingReceiving ? (
                <p className="flex justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
                </p>
              ) : receivingRequests.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  <p>Tidak ada permintaan label.</p>
                  <Link href="/gudang/penerimaan" className="mt-2 inline-block text-indigo-600 hover:underline">
                    Buka penerimaan barang
                  </Link>
                </div>
              ) : (
                <ul>
                  {receivingRequests.map((r) => (
                    <li key={`${r.poId}-${r.lineId}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedRequest(r)}
                        className={`w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm hover:bg-indigo-50 ${
                          selectedRequest?.lineId === r.lineId && selectedRequest.poId === r.poId
                            ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200"
                            : ""
                        }`}
                      >
                        <span className="font-medium">{r.productName}</span>
                        <span className="block font-mono text-xs text-slate-500">
                          PO {r.poNo} · {r.sku}
                          {r.barcode ? ` · ${r.barcode}` : ""}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-emerald-700">
                          {r.qty} stiker
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-sm">
              Nomor kode (barcode / QR) <span className="text-red-500">*</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
                value={manual.encodeValue}
                onChange={(e) => setManual({ ...manual, encodeValue: e.target.value })}
                placeholder="8991234567890"
              />
            </label>
            <label className="block text-sm">
              Judul produk
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={manual.title}
                onChange={(e) => setManual({ ...manual, title: e.target.value })}
                placeholder="Nama barang"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {tab === "manual" ? (
            <button
              type="button"
              onClick={addToQueue}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800"
            >
              + Antrian
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !activeItem || isAddingSize}
            title={isAddingSize ? "Simpan ukuran label terlebih dahulu" : undefined}
            onClick={() =>
              void runPrint(activeItem ? [activeItem] : [], activeReceivingRefs)
            }
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Cetak{effectiveCopies > 1 ? ` (${effectiveCopies})` : ""}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Download className="h-4 w-4" />
            Unduh PDF
          </p>
          <button
            type="button"
            disabled={busy || !activeItem || isAddingSize}
            onClick={() =>
              void runDownloadPdf(activeItem ? [activeItem] : [], activeReceivingRefs)
            }
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            PDF
          </button>
          <p className="mt-2 text-[10px] text-slate-500">
            Semua salinan dalam satu file PDF — termal 1 label/halaman atau grid A4/A5/A6.
            {tab === "receiving" && selectedRequest
              ? ` Permintaan penerimaan akan ditandai selesai setelah unduh.`
              : ""}
          </p>
        </div>

        {tab === "manual" && queue.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex justify-between">
              <p className="text-sm font-semibold">Antrian ({queue.length})</p>
              <button type="button" onClick={() => setQueue([])} className="text-xs text-red-600">
                Kosongkan
              </button>
            </div>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {queue.map((item, i) => (
                <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                  <span className="truncate">
                    {item.title || item.encodeValue}{" "}
                    <span className="font-mono text-slate-500">({item.encodeValue})</span>
                  </span>
                  <button type="button" onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPrint(queue)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Cetak antrian
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDownloadPdf(queue)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
              >
                PDF antrian
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Bidang & ukuran cetak</p>
          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              Bidang cetak (kertas)
              <select
                className="mt-1 w-full rounded-lg border px-2 py-2"
                value={paper}
                onChange={(e) => setPaper(e.target.value as PaperKind)}
              >
                <option value="thermal">Printer termal — stiker langsung</option>
                {SHEET_PAPERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Aktif: <strong>{paperLabel}</strong>
              </span>
            </label>

            <label className="block">
              Ukuran label (Lebar × Tinggi mm)
              <select
                className="mt-1 w-full rounded-lg border px-2 py-2"
                value={selectedSizeId}
                onChange={(e) => handleSizeSelect(e.target.value)}
              >
                {sizeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                    {opt.isCustom ? "" : ""}
                  </option>
                ))}
                <option value={ADD_LABEL_SIZE_ID}>＋ Tambah ukuran baru…</option>
              </select>
            </label>

            {isAddingSize ? (
              <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/40 p-3">
                <p className="text-xs font-medium text-indigo-900">Ukuran baru (disimpan ke daftar)</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-xs">
                    Lebar (mm)
                    <input
                      type="number"
                      min={10}
                      max={120}
                      className="mt-0.5 w-full rounded-lg border px-2 py-1.5"
                      value={draftW}
                      onChange={(e) => setDraftW(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs">
                    Tinggi (mm)
                    <input
                      type="number"
                      min={10}
                      max={120}
                      className="mt-0.5 w-full rounded-lg border px-2 py-1.5"
                      value={draftH}
                      onChange={(e) => setDraftH(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={saveNewSize}
                  className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Simpan & pakai ukuran ini
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                Dipakai: <strong>{labelDims.widthMm} × {labelDims.heightMm} mm</strong>
                {selectedSize?.isCustom ? (
                  <button
                    type="button"
                    onClick={removeSelectedCustom}
                    className="ml-2 text-red-600 hover:underline"
                  >
                    Hapus dari daftar
                  </button>
                ) : null}
              </p>
            )}

            {sheetInfo ? (
              <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                ±{sheetInfo.perPage} label per halaman ({sheetInfo.cols} kolom) — bidang{" "}
                {paper.toUpperCase()}, label {labelDims.widthMm}×{labelDims.heightMm} mm
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Termal: 1 label {labelDims.widthMm}×{labelDims.heightMm} mm per halaman.
              </p>
            )}

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-slate-500">Tipe kode (pilih satu)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {BARCODE_SYMBOLOGY_OPTIONS.map((opt) => (
                  <label key={opt.id} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="sym"
                      checked={symbology === opt.id}
                      onChange={() => setSymbology(opt.id)}
                    />
                    {opt.id === "qr" ? (
                      <QrCode className="h-4 w-4" />
                    ) : (
                      <Barcode className="h-4 w-4" />
                    )}
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              Salinan per item
              <input
                type="number"
                min={1}
                max={500}
                disabled={tab === "receiving"}
                className="mt-1 w-full rounded-lg border px-2 py-2 disabled:bg-slate-100 disabled:text-slate-600"
                value={tab === "receiving" ? effectiveCopies : copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
              {tab === "receiving" ? (
                <span className="mt-1 block text-xs text-slate-500">
                  Mengikuti qty barang masuk dari penerimaan.
                </span>
              ) : null}
            </label>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-slate-500">Teks pada label</legend>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
                Cetak judul produk
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showCode} onChange={(e) => setShowCode(e.target.checked)} />
                Cetak nomor kode
              </label>
            </fieldset>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <p className="text-sm font-semibold text-indigo-900">Pratinjau</p>
          <div className="mt-2 flex min-h-[120px] flex-col items-center justify-center rounded-lg border bg-white p-2">
            {previewLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            ) : !activeItem ? (
              <p className="text-xs text-slate-400">
                {tab === "receiving" ? "Pilih permintaan penerimaan" : "Isi kode manual"}
              </p>
            ) : (
              <>
                {showTitle && activeItem.title ? (
                  <p className="mb-1 max-w-full truncate text-center text-xs font-bold">
                    {activeItem.title}
                  </p>
                ) : null}
                {previewImg ? (
                  <img src={previewImg} alt="" className="max-h-16 max-w-full object-contain" />
                ) : null}
                {showCode ? (
                  <p className="mt-1 font-mono text-[10px] font-bold">{activeItem.encodeValue}</p>
                ) : null}
              </>
            )}
          </div>
          <p className="mt-2 text-[10px] text-indigo-800">
            {paperLabel} · {labelDims.widthMm}×{labelDims.heightMm} mm ·{" "}
            {symbologyLabel(symbology)}
          </p>
        </div>
      </div>
    </div>
  );
}
