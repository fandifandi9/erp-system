"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildJob,
  downloadBarcodeLabels,
  generateCode128DataUrl,
  generateQrDataUrl,
  isCode128Safe,
  normalizeEncodeValue,
  printBarcodeLabels,
  productToLabelItem,
  SHEET_PAPERS,
  sheetGrid,
  type BarcodeLabelItem,
  type BarcodeSymbology,
  type DownloadFormat,
  type PaperKind,
} from "@/lib/inventory/barcode-label-engine";
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
import { fetchProducts } from "@/lib/inventory/client";
import type { InvProduct } from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import {
  Barcode,
  Download,
  Loader2,
  Package,
  PenLine,
  Printer,
  QrCode,
  Search,
} from "lucide-react";

type Tab = "product" | "manual";

const defaultManual = () => ({
  encodeValue: "",
  title: "",
});

export function BarcodeLabelStudio() {
  const [tab, setTab] = useState<Tab>("product");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selected, setSelected] = useState<InvProduct | null>(null);
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
    if (tab === "product" && selected) return productToLabelItem(selected);
    if (tab === "manual" && manual.encodeValue.trim()) {
      return {
        encodeValue: manual.encodeValue.trim(),
        title: manual.title.trim() || undefined,
      };
    }
    return null;
  }, [tab, selected, manual]);

  const loadProducts = useCallback(async (search = q) => {
    setLoadingProducts(true);
    try {
      const res = await fetchProducts({ q: search, page: 1, perPage: 80 });
      setProducts(res.items as unknown as InvProduct[]);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [q]);

  useEffect(() => {
    void loadProducts("");
  }, [loadProducts]);

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
        const img =
          symbology === "code128"
            ? await generateCode128DataUrl(v, {
                barHeight: labelDims.heightMm <= 20 ? 32 : 40,
              })
            : await generateQrDataUrl(v, labelDims.heightMm <= 20 ? 120 : 160);
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
    normalizeEncodeValue(item.encodeValue);
    if (symbology === "code128" && !isCode128Safe(item.encodeValue)) {
      throw new Error("Code128: gunakan huruf/angka standar tanpa aksen.");
    }
  };

  const makeJob = (items: BarcodeLabelItem[]) =>
    buildJob(items, {
      copiesPerItem: copies,
      paper,
      label: labelDims,
      symbology,
      showTitle,
      showCode,
    });

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

  const runPrint = async (items: BarcodeLabelItem[]) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await printBarcodeLabels(makeJob(items));
    } catch (e) {
      alert(getErrorMessage(e, "Gagal cetak"));
    } finally {
      setBusy(false);
    }
  };

  const runDownload = async (items: BarcodeLabelItem[], format: DownloadFormat) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      await downloadBarcodeLabels(makeJob(items), format);
    } catch (e) {
      alert(getErrorMessage(e, "Gagal unduh"));
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
            onClick={() => setTab("product")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "product" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Package className="h-4 w-4" />
            Master produk
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

        {tab === "product" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-800">Cari produk</p>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                  placeholder="SKU / nama / barcode…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadProducts(q)}
                />
              </div>
              <button
                type="button"
                onClick={() => void loadProducts(q)}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Cari
              </button>
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
              {loadingProducts ? (
                <p className="flex justify-center gap-2 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
                </p>
              ) : products.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Tidak ada produk.</p>
              ) : (
                <ul>
                  {products.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className={`w-full border-b border-slate-50 px-3 py-2.5 text-left text-sm hover:bg-indigo-50 ${
                          selected?.id === p.id ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : ""
                        }`}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="block font-mono text-xs text-slate-500">
                          {p.sku}
                          {p.barcode ? ` · ${p.barcode}` : ""}
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
          <button
            type="button"
            onClick={addToQueue}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800"
          >
            + Antrian
          </button>
          <button
            type="button"
            disabled={busy || !activeItem || isAddingSize}
            title={isAddingSize ? "Simpan ukuran label terlebih dahulu" : undefined}
            onClick={() => void runPrint(activeItem ? [activeItem] : [])}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Cetak
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Download className="h-4 w-4" />
            Unduh label aktif
          </p>
          <div className="flex flex-wrap gap-2">
            {(["jpg", "png", "pdf", "raw"] as DownloadFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={busy || !activeItem || isAddingSize}
                onClick={() => void runDownload(activeItem ? [activeItem] : [], fmt)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {fmt}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            JPG/PNG/RAW: label pertama. PDF: semua salinan ({copies}×) — termal 1 label/halaman atau grid
            A4/A5/A6.
          </p>
        </div>

        {queue.length > 0 ? (
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
                onClick={() => void runDownload(queue, "pdf")}
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
              <label className="mr-4 inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="sym"
                  checked={symbology === "code128"}
                  onChange={() => setSymbology("code128")}
                />
                <Barcode className="h-4 w-4" />
                Code128
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="sym"
                  checked={symbology === "qr"}
                  onChange={() => setSymbology("qr")}
                />
                <QrCode className="h-4 w-4" />
                QR Code
              </label>
            </fieldset>

            <label className="block">
              Salinan per item
              <input
                type="number"
                min={1}
                max={500}
                className="mt-1 w-full rounded-lg border px-2 py-2"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
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
              <p className="text-xs text-slate-400">Pilih produk / isi kode</p>
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
            {symbology === "code128" ? "Code128" : "QR"}
          </p>
        </div>
      </div>
    </div>
  );
}
