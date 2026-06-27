"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Package,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  fetchRetur,
  fetchReturLines,
  fetchSalesOrder,
  fetchPurchaseOrder,
  updateRetur,
  updateReturLine,
  completeReturApi,
  cancelReturApi,
} from "@/lib/bisnis/client";
import { EXPECTED_CONDITION_LABEL } from "@/lib/bisnis/sales-retur-expected";
import { returAwaitingBusiness, returAwaitingWms } from "@/lib/bisnis/retur-workflow";
import { SalesReturWmsExceptionPanel } from "@/components/bisnis/SalesReturWmsExceptionPanel";
import { SalesReturSettlementPanel } from "@/components/bisnis/SalesReturSettlementPanel";
import { parseUnboxingMedia } from "@/lib/wms/unboxing-media";
import { pb } from "@/lib/pocketbase";
import type {
  Retur,
  ReturLine,
  ReturLineCondition,
  ReturStatus,
  SalesOrder,
  PurchaseOrder,
} from "@/lib/bisnis/types";

const STATUS_CONFIG: Record<ReturStatus, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-slate-100 text-slate-600" },
  approved: { label: "Disetujui", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "Selesai", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Dibatalkan", cls: "bg-red-100 text-red-700" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/,/g, ".")) || 0;

type LineDraft = ReturLine & { _key: string };

export default function ReturDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [retur, setRetur] = useState<Retur | null>(null);
  const [linkedSo, setLinkedSo] = useState<SalesOrder | null>(null);
  const [linkedPo, setLinkedPo] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [warehouses, setWarehouses] = useState<
    { id: string; name: string; code: string; warehouse_role?: string; company?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [damagedWarehouse, setDamagedWarehouse] = useState("");
  const [mpClaim, setMpClaim] = useState(0);
  const [shippingReimb, setShippingReimb] = useState(0);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let soForCompany: SalesOrder | null = null;
      const [r, ls, wh] = await Promise.all([
        fetchRetur(id),
        fetchReturLines(id),
        pb.collection("inv_warehouses").getFullList<{
          id: string;
          name: string;
          code: string;
          warehouse_role?: string;
          company?: string;
        }>({
          sort: "name",
          requestKey: null,
        }),
      ]);
      if (r.type === "penjualan") {
        const soId = r.sales_order || r.reference_id;
        if (soId) {
          router.replace(`/bisnis/penjualan/${soId}`);
          return;
        }
      }
      setRetur(r);
      if (r.type === "penjualan") {
        const soId = r.sales_order || r.reference_id;
        if (soId) {
          try {
            soForCompany = await fetchSalesOrder(soId);
            setLinkedSo(soForCompany);
          } catch {
            setLinkedSo(null);
          }
        } else setLinkedSo(null);
        setLinkedPo(null);
      } else {
        const poId = r.purchase_order || r.reference_id;
        if (poId) {
          try {
            setLinkedPo(await fetchPurchaseOrder(poId));
          } catch {
            setLinkedPo(null);
          }
        } else setLinkedPo(null);
        setLinkedSo(null);
      }
      setLines(ls.map((l) => ({ ...l, _key: l.id })));
      setWarehouses(wh);
      const companyId = soForCompany?.company;
      const defaultDamaged =
        r.damaged_warehouse ||
        wh.find((w) => w.warehouse_role === "damaged" && (!companyId || w.company === companyId))
          ?.id ||
        "";
      setDamagedWarehouse(defaultDamaged);
      setMpClaim(Number(r.mp_claim_amount) || 0);
      setShippingReimb(Number(r.shipping_reimb_amount) || 0);
      setNotes(r.notes ?? "");
      setReason(r.reason ?? "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat retur");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPenjualanType = retur?.type === "penjualan";
  const hasDamaged = useMemo(
    () => isPenjualanType && lines.some((l) => l.condition === "damaged" && l.qty > 0),
    [lines, isPenjualanType],
  );

  const damagedWarehouseOptions = useMemo(() => {
    const companyId = linkedSo?.company;
    return warehouses.filter((w) => {
      if (w.warehouse_role !== "damaged") return false;
      if (companyId && w.company && w.company !== companyId) return false;
      return true;
    });
  }, [warehouses, linkedSo?.company]);

  const refundTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.line_total) || Math.round((l.unit_price ?? 0) * l.qty)), 0),
    [lines],
  );

  const awaitingWms = retur ? returAwaitingWms(retur.workflow_phase, retur.status) : false;
  const showExpectedOnly = isPenjualanType && awaitingWms;
  const warehouseName = (id?: string) => {
    if (!id) return "—";
    const w = warehouses.find((x) => x.id === id);
    return w ? `${w.code} — ${w.name}` : id;
  };
  const awaitingBusiness = retur
    ? returAwaitingBusiness(retur.workflow_phase) ||
      (!retur.workflow_phase &&
        retur.wms_receive_status === "complete" &&
        retur.status !== "completed" &&
        retur.status !== "cancelled")
    : false;
  const reminderOverdue =
    retur?.reminder_due_at && new Date(retur.reminder_due_at) < new Date() && awaitingBusiness;

  const clarificationEditable =
    awaitingBusiness && retur?.status !== "completed" && retur?.status !== "cancelled";
  const editable = clarificationEditable;
  const canComplete = clarificationEditable;
  const canCancel =
    retur?.status === "draft" || retur?.status === "approved" || retur?.status === "completed";

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const next = { ...l, ...patch };
        const qty = Number(next.qty) || 0;
        const unit = Number(next.unit_price) || 0;
        next.line_total = Math.round(unit * qty);
        return next;
      }),
    );
  };

  const persistDraft = async () => {
    if (!retur || !editable) return;
    await updateRetur(retur.id, {
      damaged_warehouse: hasDamaged ? damagedWarehouse : "",
      mp_claim_amount: mpClaim,
      shipping_reimb_amount: shippingReimb,
      notes,
      reason,
      total: refundTotal,
    });
    for (const line of lines) {
      await updateReturLine(line.id, {
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
        condition: line.condition ?? "good",
        reason: line.reason,
      });
    }
  };

  const handleSave = async () => {
    if (!retur || !editable) return;
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!retur) return;
    const reason = window.prompt(
      retur.status === "completed"
        ? "Alasan pembatalan retur selesai (stok & pembukuan akan dibalik):"
        : "Alasan pembatalan (opsional):",
    );
    if (reason === null) return;
    if (retur.status === "completed" && !confirm("Batalkan retur selesai? Stok dan pembukuan akan dibalik.")) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      await cancelReturApi(retur.id, reason);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal membatalkan retur");
    } finally {
      setCancelling(false);
    }
  };

  const handleComplete = async () => {
    if (!retur) return;
    if (hasDamaged && !damagedWarehouse) {
      alert("Pilih gudang rusak untuk barang berkondisi rusak.");
      return;
    }
    if (!confirm("Selesaikan retur? Stok dan pembukuan akan disesuaikan.")) return;
    setCompleting(true);
    setError(null);
    try {
      await persistDraft();
      await completeReturApi(retur.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyelesaikan retur");
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!retur) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-slate-500">
        Retur tidak ditemukan.
      </div>
    );
  }

  const st = STATUS_CONFIG[retur.status];
  const isPenjualan = retur.type === "penjualan";
  const so = linkedSo;
  const po = linkedPo;
  const sourceWh = retur.expand?.warehouse;
  const hasWmsException =
    isPenjualan && retur.exception_status === "open" && retur.workflow_phase === "awaiting_business";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/bisnis/retur" className="mb-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Daftar Retur
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{retur.retur_no}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isPenjualan
              ? "Retur penjualan — kondisi barang, stok & pembukuan"
              : "Retur pembelian — kembalikan barang ke supplier"}
          </p>
        </div>
        <span className={`inline-flex self-start rounded-full px-3 py-1 text-sm font-medium ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {hasWmsException ? <SalesReturWmsExceptionPanel retur={retur} onCompleted={load} /> : null}

      {awaitingWms && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <span>Menunggu penerimaan fisik di gudang (unboxing + video).</span>
          <Link
            href={`/gudang/penerimaan/retur/${retur.id}`}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Buka di WMS
          </Link>
        </div>
      )}

      {awaitingBusiness && !hasWmsException && retur.status !== "completed" && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            reminderOverdue
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          <p className="font-semibold">Klarifikasi bisnis diperlukan</p>
          <p className="mt-1">
            Barang sudah di gudang sementara. Tentukan kondisi barang, kompensasi, lalu selesaikan retur.
          </p>
          {(() => {
            const media = parseUnboxingMedia(retur.unboxing_video_path);
            if (!media.video && !(media.photos?.length ?? 0)) return null;
            return (
              <div className="mt-2 space-y-1 text-xs font-mono break-all text-slate-600">
                {media.video ? <p>Video unboxing: {media.video}</p> : null}
                {media.photos?.map((p) => <p key={p}>Foto unboxing: {p}</p>)}
              </div>
            );
          })()}
          {reminderOverdue && (
            <p className="mt-2 font-medium text-amber-800">
              Pengingat: batas klarifikasi sudah lewat (
              {new Date(retur.reminder_due_at!).toLocaleDateString("id-ID")}).
            </p>
          )}
        </div>
      )}

      {retur.status === "completed" && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          Retur selesai
          {retur.completed_at && (
            <span className="text-emerald-600">
              · {new Date(retur.completed_at).toLocaleString("id-ID")}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Referensi</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {so && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Sales Order</dt>
                <dd>
                  <Link href={`/bisnis/penjualan/${so.id}`} className="font-medium text-indigo-600 hover:underline">
                    {so.order_no}
                  </Link>
                </dd>
              </div>
            )}
            {po && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Purchase Order</dt>
                <dd>
                  <Link href={`/bisnis/pembelian/${po.id}`} className="font-medium text-indigo-600 hover:underline">
                    {po.po_no}
                  </Link>
                </dd>
              </div>
            )}
            {retur.purchase_bill && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Tagihan</dt>
                <dd>
                  <Link
                    href={`/bisnis/pembelian/${retur.purchase_bill}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Lihat tagihan
                  </Link>
                </dd>
              </div>
            )}
            {retur.invoice && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Invoice</dt>
                <dd>
                  <Link href={`/bisnis/penjualan/${retur.invoice}`} className="font-medium text-indigo-600 hover:underline">
                    Lihat invoice
                  </Link>
                </dd>
              </div>
            )}
            {sourceWh && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Gudang toko (baik)</dt>
                <dd className="font-medium text-slate-800">{sourceWh.name}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Ringkasan</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Nilai retur</dt>
              <dd className="font-bold text-slate-900">{fmt(refundTotal)}</dd>
            </div>
            {isPenjualan && mpClaim > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Kompensasi MP</dt>
                <dd className="font-medium text-emerald-700">+{fmt(mpClaim)}</dd>
              </div>
            )}
            {isPenjualan && shippingReimb > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Reimburse ongkir</dt>
                <dd className="font-medium text-amber-700">{fmt(shippingReimb)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Package className="h-4 w-4" /> Barang Retur
          </h2>
          {isPenjualan && (
            <p className="mt-1 text-xs text-slate-500">
              Kondisi <strong>baik</strong> → gudang utama entitas. <strong>Rusak</strong> → gudang rusak.
              Stok saat ini di gudang sementara (transit).
            </p>
          )}
          {!isPenjualan && awaitingBusiness && (
            <p className="mt-1 text-xs text-slate-500">
              Stok akan keluar dari gudang utama entitas ke supplier setelah diselesaikan.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-5 py-3">Produk</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Harga</th>
                <th className="px-5 py-3 text-right">Subtotal</th>
                {isPenjualan && <th className="px-5 py-3">Kondisi</th>}
                <th className="px-5 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line._key} className="border-b border-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{line.expand?.product?.name ?? line.product}</p>
                    <p className="text-xs text-slate-400">{line.expand?.product?.sku}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateLine(line._key, { qty: Number(e.target.value) || 0 })}
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-right"
                      />
                    ) : (
                      line.qty
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmt(line.unit_price ?? 0)}</td>
                  <td className="px-5 py-3 text-right font-medium">{fmt(line.line_total ?? 0)}</td>
                {isPenjualan && (
                    <td className="px-5 py-3">
                      {showExpectedOnly ? (
                        <div>
                          <span className="font-medium text-slate-800">
                            {EXPECTED_CONDITION_LABEL[line.expected_condition ?? line.condition ?? "good"]}
                          </span>
                          <p className="mt-0.5 text-xs text-slate-500">
                            → {warehouseName(line.expected_warehouse)}
                          </p>
                        </div>
                      ) : editable ? (
                        <select
                          value={line.condition ?? "good"}
                          onChange={(e) =>
                            updateLine(line._key, { condition: e.target.value as ReturLineCondition })
                          }
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="good">Baik</option>
                          <option value="damaged">Rusak</option>
                        </select>
                      ) : (
                        <span
                          className={
                            line.condition === "damaged" ? "text-red-600" : "text-emerald-600"
                          }
                        >
                          {line.condition === "damaged" ? "Rusak" : "Baik"}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3">
                    {editable ? (
                      <input
                        type="text"
                        value={line.reason ?? ""}
                        onChange={(e) => updateLine(line._key, { reason: e.target.value })}
                        placeholder="Alasan baris"
                        className="w-full min-w-[120px] rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    ) : (
                      line.reason ?? "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-800">
          {isPenjualan ? "Pembukuan & MP" : "Pembukuan"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {isPenjualan && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Gudang rusak</label>
            <select
              value={damagedWarehouse}
              disabled={!editable}
              onChange={(e) => setDamagedWarehouse(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">— Pilih jika ada barang rusak —</option>
              {damagedWarehouseOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
            {hasDamaged && !damagedWarehouse && editable && (
              <p className="mt-1 text-xs text-amber-600">Wajib untuk barang rusak</p>
            )}
          </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">Alasan retur</label>
            <input
              type="text"
              value={reason}
              disabled={!editable}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          {isPenjualan && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Kompensasi MP (Rp)</label>
            <input
              type="text"
              disabled={!editable}
              value={mpClaim ? mpClaim.toLocaleString("id-ID") : ""}
              onChange={(e) => setMpClaim(parseNum(e.target.value))}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">Mengurangi dampak retur di total SO/invoice</p>
          </div>
          )}
          {isPenjualan && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Reimburse ongkir (Rp)</label>
            <input
              type="text"
              disabled={!editable}
              value={shippingReimb ? shippingReimb.toLocaleString("id-ID") : ""}
              onChange={(e) => setShippingReimb(parseNum(e.target.value))}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
            <p className="mt-1 text-xs text-slate-500">Tercatat sebagai biaya transportasi di pembukuan</p>
          </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Catatan</label>
          <textarea
            rows={2}
            disabled={!editable}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {canCancel && retur.status !== "cancelled" && (
          <button
            type="button"
            disabled={cancelling || completing || saving}
            onClick={() => void handleCancel()}
            className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
            Batalkan Retur
          </button>
        )}
        {canComplete && (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
              Simpan
            </button>
            <button
              type="button"
              disabled={completing || saving}
              onClick={() => void handleComplete()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Selesaikan Retur
            </button>
          </>
        )}
      </div>
    </div>
  );
}
