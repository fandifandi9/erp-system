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
  Check,
} from "lucide-react";
import {
  fetchRetur,
  fetchReturLines,
  fetchSalesOrder,
  fetchInvoice,
  fetchPurchaseOrder,
  updateRetur,
  updateReturLine,
  completeReturApi,
  cancelReturApi,
  resolveSalesReturApi,
} from "@/lib/bisnis/client";
import type { SalesReturSettlementEstimate } from "@/lib/bisnis/sales-retur-expected";
import { returAwaitingBusiness, returAwaitingWms, returProcessDisplay } from "@/lib/bisnis/retur-workflow";
import { returDisplayNo, returHasPlatformNo } from "@/lib/bisnis/retur-display";
import { SalesReturWmsStatementCard, type WmsAuditDisplay } from "@/components/bisnis/SalesReturWmsStatementCard";
import {
  SalesReturResendDialog,
  type SalesReturResendFormValue,
} from "@/components/bisnis/SalesReturResendDialog";
import {
  SalesReturCancelDialog,
} from "@/components/bisnis/SalesReturCancelDialog";
import {
  SalesReturSettlementEditor,
  estimateFromRetur,
  settlementPersistPatch,
} from "@/components/bisnis/SalesReturSettlementEditor";
import { useLocale } from "@/components/LocaleProvider";
import { settlementTotals } from "@/lib/bisnis/sales-retur-settlement";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { TENANT_COLLECTIONS } from "@/lib/tenant/collections";
import { parseWmsExceptionSummary } from "@/lib/bisnis/sales-retur-wms-exception";
import type {
  Retur,
  ReturLine,
  ReturLineCondition,
  SalesOrder,
  PurchaseOrder,
  Invoice,
} from "@/lib/bisnis/types";

async function resolveUserLabel(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const u = await pb.collection("users").getOne<{ name?: string; email?: string }>(userId, {
      requestKey: null,
    });
    return u.name?.trim() || u.email?.trim() || userId;
  } catch {
    return userId;
  }
}

type LineDraft = ReturLine & { _key: string };

export default function ReturDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLocale();
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(v);
  const [retur, setRetur] = useState<Retur | null>(null);
  const [linkedSo, setLinkedSo] = useState<SalesOrder | null>(null);
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null);
  const [linkedPo, setLinkedPo] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [warehouses, setWarehouses] = useState<
    { id: string; name: string; code: string; warehouse_role?: string; company?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [damagedWarehouse, setDamagedWarehouse] = useState("");
  const [settlementEstimate, setSettlementEstimate] = useState<SalesReturSettlementEstimate>({
    items: [],
  });
  const [settlementResetKey, setSettlementResetKey] = useState(0);
  const [notes, setNotes] = useState("");
  const [notesForWms, setNotesForWms] = useState("");
  const [reason, setReason] = useState("");
  const [processorNames, setProcessorNames] = useState<{ wms?: string; business?: string }>({});
  const [wmsAudit, setWmsAudit] = useState<WmsAuditDisplay>({});
  /** Klarifikasi: default view-only; Penyesuaian mengaktifkan edit. */
  const [adjusting, setAdjusting] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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
      setRetur(r);
      if (r.type === "penjualan") {
        const soId = r.sales_order || r.reference_id;
        // Detail tetap di modul Retur (tidak redirect ke penjualan)
        if (soId) {
          try {
            soForCompany = await fetchSalesOrder(soId);
            setLinkedSo(soForCompany);
          } catch {
            setLinkedSo(null);
          }
        } else setLinkedSo(null);
        if (r.invoice) {
          try {
            setLinkedInvoice(await fetchInvoice(r.invoice));
          } catch {
            setLinkedInvoice(null);
          }
        } else {
          setLinkedInvoice(null);
        }
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
        setLinkedInvoice(null);
      }
      setLines(
        ls.map((l) => ({
          ...l,
          _key: l.id,
          // Prefer kondisi aktual WMS bila sudah diterima; bisnis bisa Ubah sebelum Selesai.
          condition: (l.actual_condition || l.condition || "good") as ReturLineCondition,
        })),
      );
      setWarehouses(wh);
      const companyId = soForCompany?.company;
      const defaultDamaged =
        r.damaged_warehouse ||
        wh.find((w) => w.warehouse_role === "damaged" && (!companyId || w.company === companyId))
          ?.id ||
        "";
      setDamagedWarehouse(defaultDamaged);
      const est = estimateFromRetur(r);
      setSettlementEstimate(est);
      setSettlementResetKey((k) => k + 1);
      setNotes(r.notes ?? "");
      setNotesForWms(r.notes_for_wms ?? "");
      setReason(r.reason ?? "");
      setAdjusting(false);

      const names: { wms?: string; business?: string } = {};
      names.business =
        (typeof r.business_processed_by_name === "string" && r.business_processed_by_name.trim()) ||
        undefined;
      names.wms =
        (typeof r.wms_processed_by_name === "string" && r.wms_processed_by_name.trim()) ||
        undefined;
      const bizId = r.business_processed_by || r.created_by;
      const wmsId = r.wms_processed_by;
      if (!names.business && bizId) {
        names.business = await resolveUserLabel(bizId);
        if (names.business === bizId) {
          names.business = r.expand?.created_by?.name || r.expand?.created_by?.email || bizId;
        }
      }
      if (!names.wms && wmsId) {
        names.wms = await resolveUserLabel(wmsId);
      }

      // Recover audit WMS dari aktivitas gudang / notifikasi exception (data lama tanpa field audit).
      const audit: WmsAuditDisplay = {
        name: names.wms,
        startedAt: r.wms_process_started_at || null,
        endedAt: r.wms_process_completed_at || r.wms_received_at || null,
      };
      const summary = parseWmsExceptionSummary(r.wms_exception_summary);
      if (!audit.endedAt && summary?.recorded_at) {
        audit.endedAt = summary.recorded_at;
      }

      const needRecover =
        r.type === "penjualan" &&
        (Boolean(r.wms_claim_decision) ||
          r.wms_receive_status === "complete" ||
          Boolean(r.wms_dispute_note?.trim())) &&
        (!audit.name || !audit.startedAt || !audit.endedAt);

      if (needRecover) {
        let actorId = r.wms_processed_by || "";

        // 1) Notifikasi exception lama: actor = user WMS yang membantah
        if (!audit.name || !actorId) {
          try {
            type Ev = {
              actor?: string;
              occurred_at?: string;
              created?: string;
              expand?: { actor?: { name?: string; email?: string } };
            };
            const events = await pb.collection(TENANT_COLLECTIONS.activityEvents).getFullList<Ev>({
              filter: `entity_id = "${r.id}" && (event_code = "retur.sales.wms_exception" || event_code ~ "wms")`,
              sort: "-occurred_at",
              expand: "actor",
              requestKey: null,
            });
            const ev =
              events.find((e) => e.actor) ||
              events[0];
            if (ev) {
              if (!actorId && ev.actor) actorId = ev.actor;
              if (!audit.endedAt) audit.endedAt = ev.occurred_at || ev.created || null;
              if (!audit.startedAt) audit.startedAt = ev.occurred_at || ev.created || null;
              if (!audit.name) {
                audit.name =
                  ev.expand?.actor?.name?.trim() ||
                  ev.expand?.actor?.email?.trim() ||
                  (actorId ? await resolveUserLabel(actorId) : "");
                if (audit.name) names.wms = audit.name;
              }
            }
          } catch {
            /* ignore */
          }
        }

        // 2) Staff activity penerimaan WMS
        if (!audit.name || !actorId || !audit.startedAt || !audit.endedAt) {
          try {
            type Act = {
              user?: string;
              occurred_at?: string;
              created?: string;
              updated?: string;
              payload?: {
                status?: string;
                completed_by?: string;
                claim_decision?: string;
              };
            };
            const acts = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList<Act>({
              filter: `entity_type = "biz_returs" && entity_id = "${r.id}" && activity_type = "wms.sales_return_receive"`,
              sort: "-updated",
              requestKey: null,
            });
            const done =
              acts.find((a) => a.payload?.status === "complete") ||
              acts.find((a) => a.payload?.completed_by || a.payload?.claim_decision) ||
              acts[0];
            if (done) {
              if (!audit.startedAt) audit.startedAt = done.occurred_at || done.created || null;
              if (
                !audit.endedAt &&
                (done.payload?.status === "complete" || done.payload?.claim_decision)
              ) {
                audit.endedAt = done.updated || done.occurred_at || done.created || null;
              }
              const fromAct = done.payload?.completed_by || done.user || "";
              if (!actorId && fromAct) actorId = fromAct;
              if (!audit.name && actorId) {
                audit.name = await resolveUserLabel(actorId);
                names.wms = audit.name;
              }
            }
          } catch {
            /* ignore */
          }
        }

        if (actorId && !audit.name) {
          audit.name = await resolveUserLabel(actorId);
          names.wms = audit.name;
        }

        const patch: Record<string, string> = {};
        if (!r.wms_processed_by && actorId) patch.wms_processed_by = actorId;
        if (!r.wms_processed_by_name && audit.name) patch.wms_processed_by_name = audit.name;
        if (!r.wms_process_started_at && audit.startedAt) {
          patch.wms_process_started_at = audit.startedAt;
        }
        if (!r.wms_process_completed_at && audit.endedAt) {
          patch.wms_process_completed_at = audit.endedAt;
        }
        if (Object.keys(patch).length) {
          try {
            await updateRetur(r.id, patch);
            Object.assign(r, patch);
            setRetur({ ...r, ...patch });
          } catch {
            /* ignore — tetap tampil dari audit lokal */
          }
        }
      }

      // Fallback waktu dari updated/created record
      if (!audit.endedAt && r.wms_claim_decision && r.updated) {
        audit.endedAt = r.updated;
      }
      if (!audit.startedAt && (audit.endedAt || r.created)) {
        audit.startedAt = r.created || audit.endedAt;
      }

      setProcessorNames(names);
      setWmsAudit(audit);
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
  const isResend = retur?.workflow_phase === "resend";
  const wmsAgreed = retur?.wms_claim_decision === "agree";
  const wmsDisputed =
    Boolean(retur) &&
    (retur!.wms_claim_decision === "disagree" || retur!.exception_status === "open");
  const wmsReceived = retur?.wms_receive_status === "complete";
  /** Editable hanya setelah tekan Ubah. */
  const editable = clarificationEditable && adjusting && !isResend;
  const canEditNotesForWms =
    Boolean(retur) &&
    retur!.status !== "completed" &&
    retur!.status !== "cancelled" &&
    !isResend &&
    (awaitingWms || (clarificationEditable && adjusting));
  /**
   * Setuju / Selesai: setelah WMS terima.
   * Jika WMS bantah — Setuju = terima klarifikasi WMS (+ penyesuaian) lalu finalisasi stok.
   */
  const canAgree =
    clarificationEditable && !isResend && Boolean(wmsReceived) && (wmsAgreed || wmsDisputed);
  const showAdjustActions = clarificationEditable && !isResend;
  const canCancel =
    !isResend &&
    (retur?.status === "draft" || retur?.status === "approved" || retur?.status === "completed");
  /** Opsi kembalikan ke pelanggan dari Batalkan — barang sudah di hold gudang. */
  const canReturnToCustomerOnCancel =
    Boolean(retur) &&
    retur!.type === "penjualan" &&
    retur!.status === "draft" &&
    retur!.wms_receive_status === "complete" &&
    !isResend &&
    retur!.business_resolution !== "resend";

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
    if (!retur) return;
    if (editable) {
      const settlePatch = settlementPersistPatch(settlementEstimate);
      await updateRetur(retur.id, {
        damaged_warehouse: hasDamaged ? damagedWarehouse : "",
        ...settlePatch,
        notes,
        notes_for_wms: notesForWms,
        reason,
        total: refundTotal,
      });
      for (const line of lines) {
        await updateReturLine(line.id, {
          qty: line.qty,
          unit_price: line.unit_price,
          line_total: line.line_total,
          condition: line.condition ?? "good",
          actual_condition: line.condition ?? "good",
          reason: line.reason,
        });
      }
      return;
    }
    if (canEditNotesForWms) {
      await updateRetur(retur.id, {
        notes_for_wms: notesForWms,
        notes,
      });
    }
  };

  const handleSave = async () => {
    if (!retur || (!editable && !canEditNotesForWms)) {
      if (clarificationEditable && !adjusting) {
        setAdjusting(true);
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      setAdjusting(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("sales.detailRetur.errSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustClick = () => {
    if (!clarificationEditable) return;
    if (!adjusting) {
      setAdjusting(true);
      return;
    }
    void handleSave();
  };

  const runCancelProcessOnly = async (reason: string) => {
    if (!retur) return;
    if (retur.status === "completed" && !confirm(t("sales.detailRetur.confirmCancelCompleted"))) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      await cancelReturApi(retur.id, reason);
      setCancelOpen(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("sales.detailRetur.errCancel"));
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelClick = () => {
    if (!retur) return;
    setCancelOpen(true);
  };

  const holdActiveForCancel =
    Boolean(retur) &&
    retur!.wms_receive_status === "complete" &&
    retur!.status !== "completed" &&
    retur!.status !== "cancelled";

  const handleComplete = async () => {
    if (!retur) return;
    if (!wmsReceived) {
      alert(t("sales.detailRetur.errAgreeNeedConsensus"));
      return;
    }
    if (hasDamaged && !damagedWarehouse) {
      alert(t("sales.detailRetur.errDamagedWarehouse"));
      return;
    }
    if (!confirm(t(wmsDisputed ? "sales.detailRetur.confirmProcessDisagree" : "sales.detailRetur.confirmProcess")))
      return;
    setCompleting(true);
    setError(null);
    try {
      if (editable) await persistDraft();
      // Bantah WMS: catat terima klarifikasi dulu, lalu transfer sesuai kondisi (setelah Ubah).
      if (
        wmsDisputed &&
        retur.business_resolution !== "accept_wms" &&
        retur.business_resolution !== "resend"
      ) {
        await resolveSalesReturApi(retur.id, { action: "accept_wms" });
      }
      await completeReturApi(retur.id);
      setAdjusting(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("sales.detailRetur.errProcess"));
    } finally {
      setCompleting(false);
    }
  };

  const handleResendConfirm = async (value: SalesReturResendFormValue) => {
    if (!retur) return;
    setResolving(true);
    setError(null);
    try {
      if (editable) await persistDraft();
      await resolveSalesReturApi(retur.id, {
        action: "resend",
        method: value.method,
        shipping:
          value.method === "ship"
            ? {
                courier: value.courier,
                shipping_service: value.shipping_service,
                recipient_address: value.recipient_address,
                shipping_cost: value.shipping_cost,
                shipping_payer: value.shipping_payer,
              }
            : undefined,
      });
      setResendOpen(false);
      setCancelOpen(false);
      setAdjusting(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("sales.detailRetur.errResend"));
    } finally {
      setResolving(false);
    }
  };

  const resendDefaults = useMemo((): Partial<SalesReturResendFormValue> => {
    const fromSo = linkedSo ? parseNotesWithShipping(linkedSo.notes).shipping : null;
    const cust = retur?.expand?.customer;
    const address =
      fromSo?.recipient_address?.trim() ||
      [cust?.name, cust?.address, cust?.city].filter(Boolean).join("\n") ||
      "";
    return {
      method: "pickup",
      courier: fromSo?.courier || "",
      shipping_service: fromSo?.shipping_service || "",
      recipient_address: address,
      shipping_cost: fromSo?.shipping_cost || 0,
      shipping_payer: "seller",
    };
  }, [linkedSo, retur?.expand?.customer]);

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

  const st = returProcessDisplay(retur);
  const isPenjualan = retur.type === "penjualan";
  const po = linkedPo;
  const sourceWh = retur.expand?.warehouse;
  const holdInTransit =
    awaitingBusiness &&
    Boolean(retur.wms_receive_status === "complete") &&
    !retur.stock_posted_at;
  const hasWmsException =
    isPenjualan && retur.exception_status === "open" && retur.workflow_phase === "awaiting_business";
  /** Tahap 1 = claim saja: belum ringkasan penyelesaian / pernyataan WMS. */
  const showReturRingkasan = !isPenjualan || !awaitingWms;
  const showWmsStatement = isPenjualan && !awaitingWms;
  const invoiceNo =
    linkedInvoice?.invoice_no?.trim() ||
    retur.expand?.invoice?.invoice_no?.trim() ||
    "";
  const storeName =
    linkedInvoice?.expand?.store?.name?.trim() ||
    linkedSo?.expand?.store?.name?.trim() ||
    "";
  /** Kondisi baris hanya setelah WMS (bukan tahap claim). Alasan baris tidak dipakai. */
  const showLineCondition = isPenjualan && !awaitingWms;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={retur.type === "pembelian" ? "/bisnis/retur/pembelian" : "/bisnis/retur"}
            className="mb-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Daftar Retur
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{returDisplayNo(retur)}</h1>
          {returHasPlatformNo(retur) ? (
            <p className="mt-0.5 font-mono text-xs text-slate-500">Sistem: {retur.retur_no}</p>
          ) : null}
          {retur.created ? (
            <p className="mt-1 text-sm text-slate-600">
              Tanggal transaksi:{" "}
              <span className="font-medium text-slate-800">
                {new Date(retur.created).toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-500">
            {(() => {
              const creator =
                retur.expand?.created_by?.name?.trim() ||
                retur.expand?.created_by?.email?.trim() ||
                "";
              if (creator) return `Dibuat oleh ${creator}`;
              return isPenjualan
                ? "Retur penjualan"
                : "Retur pembelian — kembalikan barang ke supplier";
            })()}
          </p>
        </div>
        <div className="self-start text-right">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${st.cls}`}>
            {locale === "en" ? st.labelEn : st.label}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {awaitingWms && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <span>Pengiriman — menunggu penerimaan fisik di gudang.</span>
          <Link
            href={`/gudang/penerimaan/retur/${retur.id}`}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
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
              : "border-sky-200 bg-sky-50 text-sky-900"
          }`}
        >
          <p className="font-semibold">Klarifikasi diperlukan</p>
          <p className="mt-1">
            Barang sudah di gudang sementara. Tentukan kondisi barang, kompensasi, lalu selesaikan retur.
          </p>
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

      {/* Kiri: konten bisnis. Kanan: pernyataan WMS hanya setelah WMS memberi pernyataan. */}
      <div
        className={
          isPenjualan && !awaitingWms
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-stretch lg:gap-4"
            : undefined
        }
      >
        <div className="min-w-0 space-y-4">
      <div className={`grid gap-3 ${showReturRingkasan ? "sm:grid-cols-2" : ""}`}>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Referensi</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            {retur.invoice && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">No. INV</dt>
                <dd>
                  <Link
                    href={`/bisnis/penjualan/${retur.invoice}`}
                    className="font-mono font-medium text-indigo-600 hover:underline"
                  >
                    {invoiceNo || "Lihat invoice"}
                  </Link>
                </dd>
              </div>
            )}
            {isPenjualan ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Toko penjual</dt>
                <dd className="text-right font-medium text-slate-800">{storeName || "—"}</dd>
              </div>
            ) : null}
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
            {!isPenjualan && po && !retur.purchase_bill ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Purchase Order</dt>
                <dd>
                  <Link href={`/bisnis/pembelian/${po.id}`} className="font-medium text-indigo-600 hover:underline">
                    {po.po_no}
                  </Link>
                </dd>
              </div>
            ) : null}
            {holdInTransit ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Hold saat ini</dt>
                <dd className="font-medium text-amber-800">
                  Gudang sementara
                  {sourceWh?.name ? ` · ${sourceWh.name}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {showReturRingkasan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ringkasan</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Nilai retur</dt>
              <dd className="font-bold text-slate-900">{fmt(refundTotal)}</dd>
            </div>
            {isPenjualan && wmsReceived
              ? (() => {
                  const totals = settlementTotals(settlementEstimate);
                  return (
                    <>
                      {totals.outgoingTotal > 0 ? (
                        <div className="flex justify-between">
                          <dt className="text-slate-500">− Beban</dt>
                          <dd className="font-medium text-rose-700">{fmt(totals.outgoingTotal)}</dd>
                        </div>
                      ) : null}
                      {totals.incomingTotal > 0 ? (
                        <div className="flex justify-between">
                          <dt className="text-slate-500">+ Pemulihan</dt>
                          <dd className="font-medium text-emerald-700">{fmt(totals.incomingTotal)}</dd>
                        </div>
                      ) : null}
                    </>
                  );
                })()
              : null}
            {isPenjualan ? (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Proses bisnis
                </p>
                <p className="mt-0.5 font-medium text-slate-800">
                  {processorNames.business || "—"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {(() => {
                    const startIso = retur.business_process_started_at || retur.created;
                    const endIso = retur.business_process_completed_at || retur.completed_at;
                    const fmtShort = (iso: string) =>
                      new Date(iso).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    if (!startIso) return "—";
                    if (!endIso) return fmtShort(startIso);
                    return `${fmtShort(startIso)} → ${fmtShort(endIso)}`;
                  })()}
                </p>
              </div>
            ) : null}
          </dl>
        </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Package className="h-4 w-4" /> Barang Retur
          </h2>
          {isPenjualan && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {awaitingWms
                ? "Claim bisnis — menunggu WMS menyatakan paket tiba & setuju/bantah claim."
                : holdInTransit
                  ? "Stok hold di gudang sementara. Tentukan gudang final atau kirim kembali setelah klarifikasi WMS."
                  : "Baik → gudang toko. Rusak → gudang rusak."}
            </p>
          )}
          {!isPenjualan && awaitingBusiness && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              Stok keluar ke supplier setelah diselesaikan.
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
                {showLineCondition ? <th className="px-5 py-3">Kondisi</th> : null}
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
                  {showLineCondition ? (
                    <td className="px-5 py-3">
                      {editable ? (
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
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          {isPenjualan && !wmsReceived ? "Claim" : "Pembukuan"}
        </h2>
        {isPenjualan && !wmsReceived ? (
          <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
            Retur masih claim. Gudang final, estimasi beban/pemulihan, dan kirim kembali baru
            ditentukan setelah WMS menerima paket dan klarifikasi (setuju/bantah claim).
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {isPenjualan && wmsReceived ? (
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
          ) : null}
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
        </div>
        {isPenjualan && wmsReceived ? (
          <SalesReturSettlementEditor
            value={settlementEstimate}
            onChange={setSettlementEstimate}
            disabled={!editable}
            resetKey={`${retur.id}-${settlementResetKey}`}
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Claim bisnis</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {awaitingWms
              ? "Claim pengajuan — menunggu penerimaan & pernyataan WMS."
              : "Tidak ditimpa WMS — klarifikasi gudang di kartu pernyataan."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Catatan claim</label>
            <textarea
              rows={2}
              disabled={!canEditNotesForWms}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ringkasan klaim / dokumentasi internal"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Instruksi ke gudang</label>
            <textarea
              rows={2}
              disabled={!canEditNotesForWms}
              value={notesForWms}
              onChange={(e) => setNotesForWms(e.target.value)}
              placeholder="Apa yang harus dicek gudang (opsional)"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50"
            />
          </div>
        </div>
      </div>

      {showWmsStatement ? (
        <div className="lg:hidden">
            <SalesReturWmsStatementCard
              retur={retur}
              processorName={processorNames.wms}
              audit={wmsAudit}
              onSettled={load}
            />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        {canCancel && retur.status !== "cancelled" ? (
          <button
            type="button"
            disabled={cancelling || completing || saving || resolving}
            onClick={handleCancelClick}
            className="inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("sales.detailRetur.cancel")}
          </button>
        ) : null}
        {showAdjustActions ? (
          <button
            type="button"
            disabled={saving || completing || resolving}
            onClick={handleAdjustClick}
            className={`inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold disabled:opacity-50 ${
              adjusting
                ? "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {adjusting ? t("sales.detailRetur.adjustDone") : t("sales.detailRetur.adjust")}
          </button>
        ) : null}
        {canAgree ? (
          <button
            type="button"
            disabled={completing || saving || resolving}
            onClick={() => void handleComplete()}
            className="inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("sales.detailRetur.process")}
          </button>
        ) : null}
      </div>
        </div>

        {showWmsStatement ? (
          <aside className="relative hidden lg:block" aria-label="Klarifikasi WMS">
            <div className="sticky top-1/2 z-10 -translate-y-1/2">
            <SalesReturWmsStatementCard
              retur={retur}
              processorName={processorNames.wms}
              audit={wmsAudit}
              onSettled={load}
            />
            </div>
          </aside>
        ) : null}
      </div>

      <SalesReturCancelDialog
        open={cancelOpen}
        busy={cancelling || resolving}
        holdActive={holdActiveForCancel}
        allowReturnToCustomer={canReturnToCustomerOnCancel}
        onClose={() => {
          if (!cancelling && !resolving) setCancelOpen(false);
        }}
        onConfirmProcessOnly={(reason) => void runCancelProcessOnly(reason)}
        onChooseReturnToCustomer={() => {
          setCancelOpen(false);
          setResendOpen(true);
        }}
      />

      <SalesReturResendDialog
        open={resendOpen}
        submitting={resolving}
        defaults={resendDefaults}
        onClose={() => {
          if (!resolving) setResendOpen(false);
        }}
        onConfirm={handleResendConfirm}
      />
    </div>
  );
}
