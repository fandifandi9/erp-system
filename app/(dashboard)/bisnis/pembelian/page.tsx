"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Search, Loader2, ChevronLeft, ChevronRight, AlertCircle, Plus, Eye, Pencil, Ban, MoreHorizontal,
} from "lucide-react";
import {
  fetchPurchaseOrders,
  fetchPurchaseBills,
  cancelPurchaseBill,
  getPurchaseOrderDocStatus,
  canEditPurchaseOrderDoc,
  ORDER_DOC_STATUS_UI,
  purchaseOrderFilterToPb,
  ORDER_DOC_STATUS_FILTER,
  WMS_ROUTE_FILTER,
  wmsOrderFilterToPb,
  purchaseBillWmsFilterToPb,
  isWmsSchemaFilterError,
  matchesWmsRouteFilter,
} from "@/lib/bisnis/client";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import type { PurchaseOrder, PurchaseBill } from "@/lib/bisnis/types";
import {
  PURCHASE_STATUS_FILTER,
  PURCHASE_STATUS_UI,
  getPurchaseDisplayStatus,
  isCashPurchase,
  purchaseFilterToPb,
  canEditPurchaseBill,
  canCancelPurchaseBill,
} from "@/lib/bisnis/purchase-status";
import { CancelPurchaseModal } from "@/components/bisnis/CancelPurchaseModal";
import { getErrorMessage } from "@/lib/errors";
import Link from "next/link";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

type Tab = "tagihan" | "pesanan";
const PER_PAGE = 20;

export default function PembelianPage() {
  const [tab, setTab] = useState<Tab>("tagihan");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wmsFilter, setWmsFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectionHint, setCollectionHint] = useState<string | null>(null);

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordTotal, setOrdTotal] = useState(0);

  const [billStats, setBillStats] = useState({ belumBayar: 0, belumBayarAmt: 0, jatuhTempo: 0, jatuhTempoAmt: 0, lunas30: 0, lunas30Amt: 0 });
  const [poOnlyCount, setPoOnlyCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollectionHint(null);
    try {
      if (tab === "tagihan") {
        const filters: string[] = [];
        if (search) filters.push(`(bill_no ~ "${search}" || supplier.name ~ "${search}")`);
        const statusPb = purchaseFilterToPb(statusFilter);
        if (statusPb) filters.push(statusPb);
        const wmsPb = purchaseBillWmsFilterToPb(wmsFilter);
        if (wmsPb) filters.push(wmsPb);
        const filterStr = filters.join(" && ") || undefined;

        try {
          let res;
          let clientWmsFilter = false;
          try {
            res = await fetchPurchaseBills({
              page,
              perPage: PER_PAGE,
              sort: "-created",
              filter: filterStr,
              expand: "supplier,purchase_order.warehouse",
            });
          } catch (e) {
            if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
              const filtersNoWms = filters.filter((f) => f !== wmsPb);
              res = await fetchPurchaseBills({
                page: 1,
                perPage: 200,
                sort: "-created",
                filter: filtersNoWms.join(" && ") || undefined,
                expand: "supplier,purchase_order.warehouse",
              });
              clientWmsFilter = true;
            } else {
              throw e;
            }
          }
          let billItems = res.items;
          if (clientWmsFilter && wmsFilter !== "all") {
            billItems = billItems.filter((b) =>
              matchesWmsRouteFilter(b.expand?.purchase_order, wmsFilter, "purchase"),
            );
          }
          const billCount = clientWmsFilter && wmsFilter !== "all" ? billItems.length : res.totalItems;
          if (clientWmsFilter && wmsFilter !== "all") {
            const start = (page - 1) * PER_PAGE;
            billItems = billItems.slice(start, start + PER_PAGE);
          }
          setBills(billItems);
          setBillTotal(billCount);

          const all = await fetchPurchaseBills({ page: 1, perPage: 200, sort: "-created", expand: "supplier" });
          const now = new Date();
          const d30 = new Date(now.getTime() - 30 * 86400000);
          let bb = 0, bbA = 0, jt = 0, jtA = 0, l30 = 0, l30A = 0;
          all.items.forEach((bill) => {
            const disp = getPurchaseDisplayStatus(bill);
            if (disp === "cancelled") return;
            if (disp === "unpaid") { bb++; bbA += bill.remaining ?? 0; }
            if (disp === "overdue") { jt++; jtA += bill.remaining ?? 0; }
            if (disp === "paid" && bill.updated && new Date(bill.updated) >= d30) {
              l30++;
              l30A += bill.total ?? 0;
            }
          });
          setBillStats({ belumBayar: bb, belumBayarAmt: bbA, jatuhTempo: jt, jatuhTempoAmt: jtA, lunas30: l30, lunas30Amt: l30A });
          if (billCount === 0) {
            try {
              const poRes = await fetchPurchaseOrders({ page: 1, perPage: 1 });
              setPoOnlyCount(poRes.totalItems);
            } catch {
              setPoOnlyCount(0);
            }
          } else {
            setPoOnlyCount(0);
          }
        } catch (billErr) {
          setBills([]);
          setBillTotal(0);
          const msg = billErr instanceof Error ? billErr.message : "Gagal memuat tagihan";
          setCollectionHint(
            "Collection biz_purchase_bills belum ada atau API rule ditolak. Buat collection di PocketBase, atau cek tab Pesanan Pembelian untuk data PO lama.",
          );
          setError(msg);
        }
      } else {
        const filters: string[] = [];
        if (search) filters.push(`(po_no ~ "${search}" || supplier.name ~ "${search}")`);
        const statusPb = purchaseOrderFilterToPb(statusFilter);
        if (statusPb) filters.push(statusPb);
        const wmsPb = wmsOrderFilterToPb(wmsFilter);
        if (wmsPb) filters.push(wmsPb);
        const filterStr = filters.join(" && ") || undefined;
        let res;
        let clientWmsFilter = false;
        try {
          res = await fetchPurchaseOrders({
            page,
            perPage: PER_PAGE,
            sort: "-created",
            filter: filterStr,
            expand: "supplier,warehouse",
          });
        } catch (e) {
          if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
            const filtersNoWms = filters.filter((f) => f !== wmsPb);
            res = await fetchPurchaseOrders({
              page: 1,
              perPage: 200,
              sort: "-created",
              filter: filtersNoWms.join(" && ") || undefined,
              expand: "supplier,warehouse",
            });
            clientWmsFilter = true;
          } else {
            throw e;
          }
        }
        let ordItems = res.items;
        if (clientWmsFilter && wmsFilter !== "all") {
          ordItems = ordItems.filter((po) => matchesWmsRouteFilter(po, wmsFilter, "purchase"));
        }
        const ordCount = clientWmsFilter && wmsFilter !== "all" ? ordItems.length : res.totalItems;
        if (clientWmsFilter && wmsFilter !== "all") {
          const start = (page - 1) * PER_PAGE;
          ordItems = ordItems.slice(start, start + PER_PAGE);
        }
        setOrders(ordItems);
        setOrdTotal(ordCount);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, statusFilter, wmsFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    setPage(1);
    setStatusFilter("all");
    setWmsFilter("all");
    setSearch("");
  }, [tab]);
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, wmsFilter]);

  const totalItems = tab === "tagihan" ? billTotal : ordTotal;
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  return (
    <div className="min-h-screen">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pembelian</h1>
          <p className="mt-1 text-sm text-slate-500">Multi-toko: stok masuk ke gudang default toko</p>
        </div>
        <Link href="/bisnis/pembelian/buat"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
          <Plus className="h-4 w-4" />
          Buat pembelian baru
        </Link>
      </div>

      {tab === "tagihan" && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Tagihan belum dibayar" count={billStats.belumBayar} amount={billStats.belumBayarAmt} color="orange" />
          <SummaryCard label="Tagihan jatuh tempo" count={billStats.jatuhTempo} amount={billStats.jatuhTempoAmt} color="red" />
          <SummaryCard label="Pembayaran 30 hari terakhir" count={billStats.lunas30} amount={billStats.lunas30Amt} color="green" />
        </div>
      )}

      {collectionHint && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {collectionHint}
        </div>
      )}

      {tab === "tagihan" && !loading && !error && billTotal === 0 && poOnlyCount > 0 && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Ada {poOnlyCount} pesanan PO di sistem, tetapi belum ada tagihan pembelian.
          Data lama hanya PO — buat pembelian baru lewat tombol di atas, atau buka tab{" "}
          <button type="button" onClick={() => setTab("pesanan")} className="font-semibold underline">
            Pesanan (PO)
          </button>
          .
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200">
          <div className="flex">
            <TabBtn active={tab === "tagihan"} onClick={() => setTab("tagihan")}>Tagihan</TabBtn>
            <TabBtn active={tab === "pesanan"} onClick={() => setTab("pesanan")}>Pesanan (PO)</TabBtn>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            {tab === "tagihan"
              ? PURCHASE_STATUS_FILTER.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)
              : ORDER_DOC_STATUS_FILTER.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
          </select>
          <select
            value={wmsFilter}
            onChange={(e) => setWmsFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            {WMS_ROUTE_FILTER.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Pencarian…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-slate-500">Memuat…</span>
          </div>
        ) : tab === "tagihan" ? (
          <BillTable data={bills} onCancelled={loadData} />
        ) : (
          <POTable data={orders} />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-xs text-slate-500">Halaman {page} dari {totalPages} ({totalItems} data)</p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BillTable({ data, onCancelled }: { data: PurchaseBill[]; onCancelled: () => void }) {
  if (data.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-sm text-slate-400">
        <p>Tidak ada tagihan ditemukan.</p>
        <p className="mt-2 text-xs">Buat pembelian baru — sistem otomatis buat PO, tagihan, dan stok masuk gudang toko.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">Tanggal</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">No.</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Supplier</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Gudang masuk</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Jatuh tempo</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Proses gudang</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Sisa</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">Tindakan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((bill) => {
            const disp = getPurchaseDisplayStatus(bill);
            const st = PURCHASE_STATUS_UI[disp];
            const cash = isCashPurchase(bill);
            const wh = bill.expand?.purchase_order?.expand?.warehouse;
            return (
              <tr key={bill.id} className={`hover:bg-slate-50 ${disp === "cancelled" ? "opacity-60" : ""}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 sm:px-6">{fmtDate(bill.bill_date)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/bisnis/pembelian/${bill.id}`} className="font-medium text-indigo-600 hover:underline">{bill.bill_no}</Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{bill.expand?.supplier?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{wh?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {cash ? <span className="text-xs font-medium text-emerald-600">Cash / Lunas</span> : fmtDate(bill.due_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <WmsRouteBadge order={bill.expand?.purchase_order} kind="purchase" />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{fmt(bill.remaining ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">{fmt(bill.total ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                  <PurchaseBillActionMenu bill={bill} onCancelled={onCancelled} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseBillActionMenu({
  bill,
  onCancelled,
}: {
  bill: PurchaseBill;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (reason: string) => {
    setCancelling(true);
    try {
      await cancelPurchaseBill(bill, reason);
      setShowCancel(false);
      setOpen(false);
      onCancelled();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membatalkan"));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Tindakan <MoreHorizontal className="ml-1 inline h-3.5 w-3.5" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <Link
                href={`/bisnis/pembelian/${bill.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                <Eye className="h-3.5 w-3.5" /> Lihat Detail
              </Link>
              {canEditPurchaseBill(bill) && (
                <Link
                  href={`/bisnis/pembelian/buat?edit=${bill.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              )}
              {canCancelPurchaseBill(bill) && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => {
                    setOpen(false);
                    setShowCancel(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Batalkan
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <CancelPurchaseModal
        billNo={bill.bill_no}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
      />
    </>
  );
}

function POTable({ data }: { data: PurchaseOrder[] }) {
  if (data.length === 0) return <div className="px-6 py-16 text-center text-sm text-slate-400">Tidak ada pesanan PO.</div>;
  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">Tanggal</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">No. PO</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Supplier</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Gudang masuk</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Proses gudang</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">Tindakan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((po) => {
            const doc = getPurchaseOrderDocStatus(po);
            const st = ORDER_DOC_STATUS_UI[doc];
            const editable = canEditPurchaseOrderDoc(po);
            return (
            <tr key={po.id} className={`hover:bg-slate-50 ${doc === "cancelled" ? "opacity-60" : ""}`}>
              <td className="px-4 py-3 sm:px-6">{fmtDate(po.order_date)}</td>
              <td className="px-4 py-3">
                <Link href={`/bisnis/pembelian/${po.id}`} className="font-mono font-medium text-indigo-600 hover:underline">
                  {po.po_no}
                </Link>
              </td>
              <td className="px-4 py-3">{po.expand?.supplier?.name ?? "—"}</td>
              <td className="px-4 py-3 text-slate-500">{po.expand?.warehouse?.name ?? "—"}</td>
              <td className="px-4 py-3 text-right font-medium">{fmt(po.total ?? 0)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              </td>
              <td className="px-4 py-3">
                <WmsRouteBadge order={po} kind="purchase" />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                <Link href={`/bisnis/pembelian/${po.id}`} className="text-xs text-indigo-600 hover:underline">
                  {editable ? "Detail" : "Preview"}
                </Link>
                {editable ? (
                  <>
                    <span className="mx-2 text-slate-300">|</span>
                    <Link href={`/bisnis/pembelian/buat?po=${po.id}`} className="text-xs text-indigo-600 hover:underline">
                      Edit
                    </Link>
                  </>
                ) : doc !== "cancelled" ? (
                  <>
                    <span className="mx-2 text-slate-300">|</span>
                    <Link href={`/bisnis/pembelian/${po.id}`} className="text-xs text-indigo-600 hover:underline">
                      Cetak
                    </Link>
                  </>
                ) : null}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`relative px-5 py-3 text-sm font-medium ${active ? "text-indigo-600" : "text-slate-500"}`}>
      {children}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
    </button>
  );
}

function SummaryCard({ label, count, amount, color }: { label: string; count: number; amount: number; color: "orange" | "red" | "green" }) {
  const styles = { orange: "border-l-orange-400 bg-orange-50", red: "border-l-red-400 bg-red-50", green: "border-l-emerald-400 bg-emerald-50" };
  const countBg = { orange: "bg-orange-400", red: "bg-red-400", green: "bg-emerald-400" };
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 p-4 ${styles[color]}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${countBg[color]}`}>{count}</span>
      </div>
      <div className="text-lg font-bold text-slate-900">{fmt(amount)}</div>
    </div>
  );
}
