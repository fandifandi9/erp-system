"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  createSalesReturFromOrderApi,
  fetchInvoiceBySalesOrder,
  fetchSalesOrderLines,
} from "@/lib/bisnis/client";
import type { CreateSalesReturLineInput } from "@/lib/bisnis/sales-retur-expected";
import { fetchCouriersCached } from "@/lib/bisnis/couriers";
import { invoicePreviewForReturUrl } from "@/lib/bisnis/module-routes";
import {
  BISNIS_COLLECTIONS,
  type Courier,
  type Invoice,
  type SalesOrder,
  type SalesOrderLine,
} from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { parseSerialNumbersJson } from "@/lib/wms/serial-numbers";
import { useLocale } from "@/components/LocaleProvider";

type LineDraft = {
  sales_order_line: string;
  productName: string;
  sku: string;
  serials: string[];
  maxQty: number;
  qty: number;
  included: boolean;
};

type Props = {
  open: boolean;
  salesOrder: SalesOrder;
  onClose: () => void;
  onCreated: (returId: string) => void;
};

async function loadRemainingBySoLine(salesOrderId: string, soLines: SalesOrderLine[]) {
  const remaining: Record<string, number> = {};
  for (const sol of soLines) {
    const returLines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<{
      qty: number;
      expand?: { retur?: { status?: string } };
    }>({
      filter: `sales_order_line = "${sol.id}"`,
      expand: "retur",
      requestKey: null,
    });
    const used = returLines
      .filter((l) => l.expand?.retur?.status === "completed")
      .reduce((s, l) => s + (Number(l.qty) || 0), 0);
    remaining[sol.id] = Math.max(0, (Number(sol.qty) || 0) - used);
  }
  return remaining;
}

export function SalesReturCreateModal({ open, salesOrder, onClose, onCreated }: Props) {
  const { t, locale } = useLocale();
  const fmtNum = (v: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "id-ID").format(v);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null);
  const [reason, setReason] = useState("");
  const [notesForWms, setNotesForWms] = useState("");
  const [platformReturNo, setPlatformReturNo] = useState("");
  const [returnMethod, setReturnMethod] = useState<"dropoff" | "courier">("dropoff");
  const [returnCourier, setReturnCourier] = useState("");
  const [returnTrackingNo, setReturnTrackingNo] = useState("");
  const [couriers, setCouriers] = useState<Courier[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [soLines, courierList, invoice] = await Promise.all([
        fetchSalesOrderLines(salesOrder.id),
        fetchCouriersCached(true).catch(() => [] as Courier[]),
        fetchInvoiceBySalesOrder(salesOrder.id).catch(() => null),
      ]);
      setCouriers(courierList);
      setLinkedInvoice(invoice && invoice.status !== "cancelled" ? invoice : null);
      const remaining = await loadRemainingBySoLine(salesOrder.id, soLines);
      setLines(
        soLines
          .filter((sol) => (remaining[sol.id] ?? 0) > 0)
          .map((sol) => ({
            sales_order_line: sol.id,
            productName:
              sol.expand?.product?.name ?? sol.name_snapshot ?? t("sales.createRetur.productFallback"),
            sku: sol.expand?.product?.sku ?? sol.sku_snapshot ?? "—",
            serials: parseSerialNumbersJson(sol.serial_numbers_json),
            maxQty: remaining[sol.id] ?? 0,
            qty: remaining[sol.id] ?? 0,
            included: true,
          })),
      );
    } finally {
      setLoading(false);
    }
  }, [salesOrder, t]);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNotesForWms("");
    setPlatformReturNo("");
    setReturnMethod("dropoff");
    setReturnCourier("");
    setReturnTrackingNo("");
    setLinkedInvoice(null);
    void load();
  }, [open, load]);

  const patchLine = (lineId: string, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l) => (l.sales_order_line === lineId ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async () => {
    const payloadLines: CreateSalesReturLineInput[] = lines
      .filter((l) => l.included && l.qty > 0)
      .map((l) => ({
        sales_order_line: l.sales_order_line,
        qty: l.qty,
        // Tahap claim: kondisi belum ditentukan — default good; WMS/bisnis sesuaikan belakangan.
        expected_condition: "good",
      }));

    if (!payloadLines.length) {
      alert(t("sales.createRetur.errSelectLine"));
      return;
    }

    if (returnMethod === "courier") {
      if (!returnCourier.trim()) {
        alert(t("sales.createRetur.errReturnCourier"));
        return;
      }
      if (!returnTrackingNo.trim()) {
        alert(t("sales.createRetur.errReturnTracking"));
        return;
      }
    }

    setSubmitting(true);
    try {
      const { retur } = await createSalesReturFromOrderApi(salesOrder.id, {
        reason: reason.trim() || undefined,
        notes_for_wms: notesForWms.trim() || undefined,
        platform_retur_no: platformReturNo.trim() || undefined,
        return_method: returnMethod,
        return_courier: returnMethod === "courier" ? returnCourier.trim() : undefined,
        return_tracking_no: returnMethod === "courier" ? returnTrackingNo.trim() : undefined,
        lines: payloadLines,
      });
      onCreated(retur.id);
      onClose();
    } catch (e: unknown) {
      alert(getErrorMessage(e, t("sales.createRetur.errCreate")));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t("sales.createRetur.title")}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {linkedInvoice ? (
                <>
                  <span>{t("sales.createRetur.refInv")} </span>
                  <Link
                    href={invoicePreviewForReturUrl(linkedInvoice.id)}
                    className="font-mono font-medium text-indigo-600 hover:underline"
                  >
                    {linkedInvoice.invoice_no}
                  </Link>
                </>
              ) : (
                <span className="font-mono text-slate-500">{salesOrder.order_no}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t("sales.createRetur.emptyAllReturned")}</p>
          ) : (
            <div className="space-y-5">
              {/* Cara pengembalian */}
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("sales.createRetur.returnMethod")}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t("sales.createRetur.returnMethodHint")}
                  </p>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:gap-6">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="return-method"
                      checked={returnMethod === "dropoff"}
                      onChange={() => setReturnMethod("dropoff")}
                    />
                    {t("sales.createRetur.returnDropoff")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="return-method"
                      checked={returnMethod === "courier"}
                      onChange={() => setReturnMethod("courier")}
                    />
                    {t("sales.createRetur.returnCourier")}
                  </label>
                </div>
                {returnMethod === "courier" ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        {t("sales.createRetur.returnCourierLabel")}
                      </span>
                      <select
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        value={returnCourier}
                        onChange={(e) => setReturnCourier(e.target.value)}
                      >
                        <option value="">{t("sales.createRetur.returnCourierPlaceholder")}</option>
                        {couriers.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        {t("sales.createRetur.returnTracking")}
                      </span>
                      <input
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                        value={returnTrackingNo}
                        onChange={(e) => setReturnTrackingNo(e.target.value)}
                        placeholder={t("sales.createRetur.returnTrackingPlaceholder")}
                      />
                    </label>
                  </div>
                ) : null}
              </section>

              {/* Nomor platform opsional */}
              <section className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("sales.createRetur.platformReturNo")}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t("sales.createRetur.platformReturNoHint")}
                  </p>
                </div>
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900"
                  value={platformReturNo}
                  onChange={(e) => setPlatformReturNo(e.target.value)}
                  placeholder={t("sales.createRetur.platformReturNoPlaceholder")}
                />
              </section>

              {/* Alasan + instruksi */}
              <section className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div className="flex flex-col gap-1.5">
                  <h3 className="min-h-[2.25rem] text-sm font-semibold leading-snug text-slate-900">
                    {t("sales.createRetur.reason")}
                  </h3>
                  <textarea
                    rows={3}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("sales.createRetur.reasonPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="min-h-[2.25rem]">
                    <h3 className="text-sm font-semibold leading-snug text-slate-900">
                      {t("sales.createRetur.notesForWms")}
                    </h3>
                    <p className="text-[10px] leading-tight text-slate-400">
                      {t("sales.createRetur.notesForWmsHint")}
                    </p>
                  </div>
                  <textarea
                    rows={3}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    value={notesForWms}
                    onChange={(e) => setNotesForWms(e.target.value)}
                    placeholder={t("sales.createRetur.notesForWmsPlaceholder")}
                  />
                </div>
              </section>

              {/* Barang */}
              <section className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("sales.createRetur.colProduct")}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {locale === "en"
                      ? "Select items and qty to claim. Condition is decided after WMS receives the goods."
                      : "Pilih barang dan qty claim. Kondisi ditentukan setelah WMS menerima barang."}
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="w-10 px-3 py-2.5">✓</th>
                        <th className="px-3 py-2.5">{t("sales.createRetur.colProduct")}</th>
                        <th className="px-3 py-2.5 text-right">{t("sales.createRetur.colQty")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.sales_order_line} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={line.included}
                              onChange={(e) =>
                                patchLine(line.sales_order_line, { included: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-900">{line.productName}</p>
                            <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                            {line.serials.length > 0 ? (
                              <p className="mt-1 font-mono text-[11px] text-indigo-700">
                                {t("sales.createRetur.colSerial")}: {line.serials.join(", ")}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="inline-flex w-full items-center justify-end gap-2">
                              <input
                                type="number"
                                min={1}
                                max={line.maxQty}
                                disabled={!line.included}
                                value={line.qty}
                                onChange={(e) =>
                                  patchLine(line.sales_order_line, {
                                    qty: Math.min(
                                      line.maxQty,
                                      Math.max(1, Number(e.target.value) || 0),
                                    ),
                                  })
                                }
                                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 disabled:bg-slate-50"
                              />
                              <span className="whitespace-nowrap text-xs text-slate-500 tabular-nums">
                                {t("sales.createRetur.colQtyMax", { max: fmtNum(line.maxQty) })}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("sales.createRetur.cancel")}
          </button>
          <button
            type="button"
            disabled={submitting || loading || lines.length === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("sales.createRetur.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
