"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  FileSearch,
  FilePlus2,
  Loader2,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import {
  createPurchaseReturFromOrderApi,
  createReturHubApi,
  fetchCustomers,
  fetchPurchaseOrders,
  fetchPurchaseOrderLines,
  fetchSalesOrders,
  fetchSalesOrderLines,
  fetchSuppliers,
  fetchSalesOrder,
  fetchPurchaseOrder,
  fetchInvoices,
  fetchPurchaseBills,
  fetchInvoiceBySalesOrder,
  fetchPurchaseBillByPurchaseOrder,
  fetchCustomer,
  fetchSupplier,
} from "@/lib/bisnis/client";
import { fetchProducts, fetchWarehouses } from "@/lib/inventory/client";
import { SalesReturCreateModal } from "@/components/bisnis/SalesReturCreateModal";
import {
  RETUR_MODULE,
  invoicePreviewForReturUrl,
  billPreviewForReturUrl,
  salesOrderPreviewForReturUrl,
  purchaseOrderPreviewForReturUrl,
} from "@/lib/bisnis/module-routes";
import { useWorkCompanyId } from "@/components/WorkContextProvider";
import { getErrorMessage } from "@/lib/errors";
import type {
  Customer,
  Invoice,
  PurchaseBill,
  PurchaseOrder,
  PurchaseOrderLine,
  ReturLineCondition,
  ReturType,
  SalesOrder,
  SalesOrderLine,
  Supplier,
} from "@/lib/bisnis/types";
import type { InvProduct, InvWarehouse } from "@/lib/inventory/types";

type SourceMode = "doc" | "standalone";

type DocLinePreview = {
  name: string;
  sku: string;
  qty: number;
};

type SalesReturHit = {
  invoice: Invoice;
  so: SalesOrder | null;
  products: DocLinePreview[];
};

type SalesCancelHit = {
  so: SalesOrder;
  products: DocLinePreview[];
};

type PurchaseReturHit = {
  bill: PurchaseBill;
  po: PurchaseOrder | null;
  products: DocLinePreview[];
};

type PurchaseCancelHit = {
  po: PurchaseOrder;
  products: DocLinePreview[];
};

type StandaloneLine = {
  key: string;
  product: string;
  productName: string;
  sku: string;
  qty: number;
  unit_price: number;
  expected_condition: ReturLineCondition;
};

function escapeFilter(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function previewFromSalesLines(lines: SalesOrderLine[]): DocLinePreview[] {
  return lines.map((l) => ({
    name: l.expand?.product?.name ?? l.name_snapshot ?? "Produk",
    sku: l.expand?.product?.sku ?? l.sku_snapshot ?? "—",
    qty: Number(l.qty) || 0,
  }));
}

function previewFromPurchaseLines(lines: PurchaseOrderLine[]): DocLinePreview[] {
  return lines.map((l) => ({
    name: l.expand?.product?.name ?? "Produk",
    sku: l.expand?.product?.sku ?? "—",
    qty: Number(l.qty) || 0,
  }));
}

let lineKeySeq = 0;
function nextLineKey() {
  lineKeySeq += 1;
  return `rl-${lineKeySeq}`;
}

export default function ReturBuatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = useWorkCompanyId();

  const initialType = (searchParams.get("type") as ReturType | null) || null;
  const soParam = searchParams.get("so")?.trim() || "";
  const poParam = searchParams.get("po")?.trim() || "";
  const modeParam = (searchParams.get("mode") as SourceMode | null) || null;

  const [type, setType] = useState<ReturType | null>(
    soParam ? "penjualan" : poParam ? "pembelian" : initialType,
  );
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(
    soParam || poParam ? "doc" : modeParam,
  );

  const [soForModal, setSoForModal] = useState<SalesOrder | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [salesReturHits, setSalesReturHits] = useState<SalesReturHit[]>([]);
  const [salesCancelHits, setSalesCancelHits] = useState<SalesCancelHit[]>([]);
  const [purchaseReturHits, setPurchaseReturHits] = useState<PurchaseReturHit[]>([]);
  const [purchaseCancelHits, setPurchaseCancelHits] = useState<PurchaseCancelHit[]>([]);
  const [creatingPoId, setCreatingPoId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [productQ, setProductQ] = useState("");
  const [productHits, setProductHits] = useState<InvProduct[]>([]);
  const [productBusy, setProductBusy] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [notesForWms, setNotesForWms] = useState("");
  const [lines, setLines] = useState<StandaloneLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Prefill SO modal from ?so=
  useEffect(() => {
    if (!soParam) return;
    let cancelled = false;
    void fetchSalesOrder(soParam)
      .then((so) => {
        if (!cancelled) {
          setSoForModal(so);
          setType("penjualan");
          setSourceMode("doc");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(getErrorMessage(e, "Gagal memuat sales order"));
      });
    return () => {
      cancelled = true;
    };
  }, [soParam]);

  // Auto-create from ?po=
  useEffect(() => {
    if (!poParam) return;
    let cancelled = false;
    setCreatingPoId(poParam);
    void createPurchaseReturFromOrderApi(poParam)
      .then((res) => {
        if (!cancelled) router.replace(`${RETUR_MODULE.penjualan}/${res.retur.id}`);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(getErrorMessage(e, "Gagal membuat retur pembelian"));
          setCreatingPoId(null);
          setType("pembelian");
          setSourceMode("doc");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [poParam, router]);

  const loadDocList = useCallback(async () => {
    if (!type || sourceMode !== "doc") return;
    setDocLoading(true);
    setError("");
    setSalesReturHits([]);
    setSalesCancelHits([]);
    setPurchaseReturHits([]);
    setPurchaseCancelHits([]);
    try {
      const q = docSearch.trim();
      const esc = q ? escapeFilter(q) : "";

      if (type === "penjualan") {
        const invParts: string[] = [`status != "cancelled"`];
        if (esc) {
          const orParts = [`invoice_no ~ "${esc}"`];
          const cust = await fetchCustomers({
            page: 1,
            perPage: 40,
            filter: `name ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as Customer[] }));
          for (const c of cust.items.slice(0, 20)) {
            orParts.push(`customer = "${c.id}"`);
          }
          const soByNo = await fetchSalesOrders({
            page: 1,
            perPage: 20,
            filter: `order_no ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as SalesOrder[] }));
          for (const so of soByNo.items) {
            orParts.push(`sales_order = "${so.id}"`);
          }
          invParts.push(`(${orParts.join(" || ")})`);
        }
        const invRes = await fetchInvoices({
          page: 1,
          perPage: 20,
          filter: invParts.join(" && "),
          companyId: companyId || undefined,
          expand: "customer,sales_order",
          sort: "-created",
        });

        const returHits: SalesReturHit[] = await Promise.all(
          invRes.items.map(async (invoice) => {
            let so: SalesOrder | null =
              (invoice.expand?.sales_order as SalesOrder | undefined) ?? null;
            const soId = invoice.sales_order || so?.id || "";
            if (!so && soId) {
              try {
                so = await fetchSalesOrder(soId);
              } catch {
                so = null;
              }
            }
            let products: DocLinePreview[] = [];
            if (soId) {
              try {
                products = previewFromSalesLines(await fetchSalesOrderLines(soId));
              } catch {
                products = [];
              }
            }
            return { invoice, so, products };
          }),
        );
        setSalesReturHits(returHits);

        // SO aktif tanpa invoice → bisa dibatalkan (bukan retur)
        const soParts: string[] = [`status != "cancelled"`];
        if (esc) {
          const orParts = [`order_no ~ "${esc}"`];
          const cust = await fetchCustomers({
            page: 1,
            perPage: 40,
            filter: `name ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as Customer[] }));
          for (const c of cust.items.slice(0, 20)) {
            orParts.push(`customer = "${c.id}"`);
          }
          soParts.push(`(${orParts.join(" || ")})`);
        }
        const soRes = await fetchSalesOrders({
          page: 1,
          perPage: 20,
          filter: soParts.join(" && "),
          companyId: companyId || undefined,
          expand: "customer,warehouse",
          sort: "-created",
        });
        const invoiceSoIds = new Set(
          returHits.map((h) => h.invoice.sales_order || h.so?.id).filter(Boolean) as string[],
        );
        const cancelCandidates = soRes.items.filter((so) => !invoiceSoIds.has(so.id));
        const cancelHits: SalesCancelHit[] = [];
        for (const so of cancelCandidates.slice(0, 20)) {
          const inv = await fetchInvoiceBySalesOrder(so.id).catch(() => null);
          if (inv && inv.status !== "cancelled") continue;
          let products: DocLinePreview[] = [];
          try {
            products = previewFromSalesLines(await fetchSalesOrderLines(so.id));
          } catch {
            products = [];
          }
          let row = so;
          if (so.customer && !so.expand?.customer?.name) {
            try {
              const c = await fetchCustomer(so.customer);
              row = { ...so, expand: { ...so.expand, customer: c } };
            } catch {
              /* keep */
            }
          }
          cancelHits.push({ so: row, products });
        }
        setSalesCancelHits(cancelHits);
        setPurchaseReturHits([]);
        setPurchaseCancelHits([]);
      } else {
        const billParts: string[] = [`status != "cancelled"`];
        if (esc) {
          const orParts = [`bill_no ~ "${esc}"`];
          const supp = await fetchSuppliers({
            page: 1,
            perPage: 40,
            filter: `name ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as Supplier[] }));
          for (const s of supp.items.slice(0, 20)) {
            orParts.push(`supplier = "${s.id}"`);
          }
          const poByNo = await fetchPurchaseOrders({
            page: 1,
            perPage: 20,
            filter: `po_no ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as PurchaseOrder[] }));
          for (const po of poByNo.items) {
            orParts.push(`purchase_order = "${po.id}"`);
          }
          billParts.push(`(${orParts.join(" || ")})`);
        }
        const billRes = await fetchPurchaseBills({
          page: 1,
          perPage: 20,
          filter: billParts.join(" && "),
          companyId: companyId || undefined,
          expand: "supplier,purchase_order",
          sort: "-created",
        });

        const returHits: PurchaseReturHit[] = await Promise.all(
          billRes.items.map(async (bill) => {
            let po: PurchaseOrder | null =
              (bill.expand?.purchase_order as PurchaseOrder | undefined) ?? null;
            const poId = bill.purchase_order || po?.id || "";
            if (!po && poId) {
              try {
                po = await fetchPurchaseOrder(poId);
              } catch {
                po = null;
              }
            }
            let products: DocLinePreview[] = [];
            if (poId) {
              try {
                products = previewFromPurchaseLines(await fetchPurchaseOrderLines(poId));
              } catch {
                products = [];
              }
            }
            return { bill, po, products };
          }),
        );
        setPurchaseReturHits(returHits);

        const poParts: string[] = [`status != "cancelled"`];
        if (esc) {
          const orParts = [`po_no ~ "${esc}"`];
          const supp = await fetchSuppliers({
            page: 1,
            perPage: 40,
            filter: `name ~ "${esc}"`,
            companyId: companyId || undefined,
          }).catch(() => ({ items: [] as Supplier[] }));
          for (const s of supp.items.slice(0, 20)) {
            orParts.push(`supplier = "${s.id}"`);
          }
          poParts.push(`(${orParts.join(" || ")})`);
        }
        const poRes = await fetchPurchaseOrders({
          page: 1,
          perPage: 20,
          filter: poParts.join(" && "),
          companyId: companyId || undefined,
          expand: "supplier,warehouse",
          sort: "-created",
        });
        const billPoIds = new Set(
          returHits.map((h) => h.bill.purchase_order || h.po?.id).filter(Boolean) as string[],
        );
        const cancelCandidates = poRes.items.filter((po) => !billPoIds.has(po.id));
        const cancelHits: PurchaseCancelHit[] = [];
        for (const po of cancelCandidates.slice(0, 20)) {
          const bill = await fetchPurchaseBillByPurchaseOrder(po.id).catch(() => null);
          if (bill && bill.status !== "cancelled") continue;
          let products: DocLinePreview[] = [];
          try {
            products = previewFromPurchaseLines(await fetchPurchaseOrderLines(po.id));
          } catch {
            products = [];
          }
          let row = po;
          if (po.supplier && !po.expand?.supplier?.name) {
            try {
              const s = await fetchSupplier(po.supplier);
              row = { ...po, expand: { ...po.expand, supplier: s } };
            } catch {
              /* keep */
            }
          }
          cancelHits.push({ po: row, products });
        }
        setPurchaseCancelHits(cancelHits);
        setSalesReturHits([]);
        setSalesCancelHits([]);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat daftar dokumen"));
    } finally {
      setDocLoading(false);
    }
  }, [type, sourceMode, docSearch, companyId]);

  useEffect(() => {
    if (sourceMode === "doc" && type && !soParam && !poParam) {
      void loadDocList();
    }
  }, [sourceMode, type, loadDocList, soParam, poParam]);

  useEffect(() => {
    if (sourceMode !== "standalone") return;
    let cancelled = false;
    void Promise.all([
      fetchCustomers({ page: 1, perPage: 200, companyId: companyId || undefined }).catch(() => ({
        items: [] as Customer[],
      })),
      fetchSuppliers({ page: 1, perPage: 200, companyId: companyId || undefined }).catch(() => ({
        items: [] as Supplier[],
      })),
      fetchWarehouses(true).catch(() => [] as InvWarehouse[]),
    ]).then(([cust, supp, wh]) => {
      if (cancelled) return;
      setCustomers(cust.items ?? []);
      setSuppliers(supp.items ?? []);
      const scoped = companyId
        ? wh.filter((w) => !w.company || w.company === companyId)
        : wh;
      setWarehouses(scoped.filter((w) => w.warehouse_role !== "transit"));
      if (!warehouseId && scoped[0]) {
        const main = scoped.find((w) => w.warehouse_role === "main") ?? scoped[0];
        setWarehouseId(main.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sourceMode, companyId, warehouseId]);

  useEffect(() => {
    if (sourceMode !== "standalone") return;
    const q = productQ.trim();
    if (q.length < 2) {
      setProductHits([]);
      return;
    }
    let cancelled = false;
    setProductBusy(true);
    const t = window.setTimeout(() => {
      void fetchProducts({ q, perPage: 20, sellableOnly: type === "penjualan" })
        .then((res) => {
          if (!cancelled) setProductHits(res.items as unknown as InvProduct[]);
        })
        .catch(() => {
          if (!cancelled) setProductHits([]);
        })
        .finally(() => {
          if (!cancelled) setProductBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [productQ, sourceMode, type]);

  const operationalWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouse_role !== "damaged" && w.warehouse_role !== "transit"),
    [warehouses],
  );

  const addProduct = (p: InvProduct) => {
    setLines((prev) => {
      if (prev.some((l) => l.product === p.id)) return prev;
      return [
        ...prev,
        {
          key: nextLineKey(),
          product: p.id,
          productName: p.name,
          sku: p.sku || "—",
          qty: 1,
          unit_price: Number(p.buy_price) || Number(p.sell_price) || 0,
          expected_condition: "good",
        },
      ];
    });
    setProductQ("");
    setProductHits([]);
  };

  const submitStandalone = async () => {
    if (!type) return;
    setSubmitting(true);
    setError("");
    try {
      const { retur } = await createReturHubApi({
        mode: "standalone",
        type,
        warehouse: warehouseId,
        company: companyId || undefined,
        customer: type === "penjualan" ? customerId : undefined,
        supplier: type === "pembelian" ? supplierId : undefined,
        reason: reason.trim() || undefined,
        notes_for_wms: notesForWms.trim() || undefined,
        lines: lines.map((l) => ({
          product: l.product,
          qty: l.qty,
          unit_price: l.unit_price,
          expected_condition: type === "penjualan" ? "good" : l.expected_condition,
        })),
      });
      router.push(`${RETUR_MODULE.penjualan}/${retur.id}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal membuat retur"));
    } finally {
      setSubmitting(false);
    }
  };

  if (creatingPoId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <div className="text-center text-sm text-slate-600">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-600" />
          Membuat retur pembelian…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Link
          href={type === "pembelian" ? RETUR_MODULE.pembelian : RETUR_MODULE.penjualan}
          className="mb-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke daftar retur
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Buat Retur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pilih jenis retur, lalu dari dokumen jual/beli atau tanpa dokumen sumber.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Step 1: type */}
      {!type ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setType("penjualan")}
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left hover:border-amber-400"
          >
            <ArrowDownLeft className="mb-2 h-6 w-6 text-amber-700" />
            <p className="font-semibold text-amber-950">Retur penjualan</p>
            <p className="mt-1 text-xs text-amber-800/80">Barang kembali dari pelanggan</p>
          </button>
          <button
            type="button"
            onClick={() => setType("pembelian")}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-left hover:border-blue-400"
          >
            <ArrowUpRight className="mb-2 h-6 w-6 text-blue-700" />
            <p className="font-semibold text-blue-950">Retur pembelian</p>
            <p className="mt-1 text-xs text-blue-800/80">Barang dikirim balik ke pemasok</p>
          </button>
        </div>
      ) : null}

      {/* Step 2: source */}
      {type && !sourceMode ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setType(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            ← Ganti jenis
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSourceMode("doc")}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300"
            >
              <FileSearch className="mb-2 h-6 w-6 text-indigo-600" />
              <p className="font-semibold text-slate-900">Dari invoice / tagihan</p>
              <p className="mt-1 text-xs text-slate-500">
                Retur hanya dari invoice (penjualan) atau tagihan (pembelian). Belum ada invoice →
                batalkan pesanan.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSourceMode("standalone")}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-indigo-300"
            >
              <FilePlus2 className="mb-2 h-6 w-6 text-slate-700" />
              <p className="font-semibold text-slate-900">Tanpa dokumen sumber</p>
              <p className="mt-1 text-xs text-slate-500">Retur mandiri — bukan dari SO/PO</p>
            </button>
          </div>
        </div>
      ) : null}

      {/* From document */}
      {type && sourceMode === "doc" && !soForModal ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSourceMode(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            ← Ganti sumber
          </button>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadDocList();
                  }
                }}
                placeholder={
                  type === "penjualan"
                    ? "Cari nomor invoice / nama pembeli…"
                    : "Cari nomor tagihan / nama pemasok…"
                }
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadDocList()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Cari
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {type === "penjualan" ? (
              <>
                Retur dari <span className="font-medium text-slate-700">nomor invoice</span>. SO tanpa
                invoice: batalkan pesanan (bukan retur).
              </>
            ) : (
              <>
                Retur dari <span className="font-medium text-slate-700">nomor tagihan</span>. PO tanpa
                tagihan: batalkan pesanan (bukan retur).
              </>
            )}
          </p>
          <div className="space-y-4">
            {docLoading ? (
              <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : type === "penjualan" ? (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-amber-50/80 px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Bisa diretur (ada invoice)
                    </p>
                  </div>
                  {salesReturHits.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      Tidak ada invoice aktif. Coba nomor invoice atau nama pembeli.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {salesReturHits.map(({ invoice, so, products }) => {
                        const buyer =
                          invoice.expand?.customer?.name?.trim() ||
                          so?.expand?.customer?.name?.trim() ||
                          "—";
                        return (
                          <li
                            key={invoice.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <Link
                                  href={invoicePreviewForReturUrl(invoice.id)}
                                  className="font-mono text-sm font-semibold text-indigo-700 hover:underline"
                                >
                                  {invoice.invoice_no}
                                </Link>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {invoice.status}
                                </span>
                              </div>
                              <p className="text-sm text-slate-800">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Pembeli
                                </span>
                                <span className="mt-0.5 block font-medium">{buyer}</span>
                              </p>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Produk
                                </p>
                                {products.length === 0 ? (
                                  <p className="mt-0.5 text-xs text-slate-400">—</p>
                                ) : (
                                  <ul className="mt-1 space-y-0.5">
                                    {products.map((p, i) => (
                                      <li key={`${invoice.id}-${i}`} className="text-sm text-slate-700">
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-slate-400"> · </span>
                                        <span className="font-mono text-xs text-slate-500">{p.sku}</span>
                                        <span className="text-slate-400"> · </span>
                                        <span className="tabular-nums text-slate-600">qty {p.qty}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                            <Link
                              href={invoicePreviewForReturUrl(invoice.id)}
                              className="shrink-0 self-start rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Lihat invoice
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Belum invoice — batalkan SO
                    </p>
                  </div>
                  {salesCancelHits.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      Tidak ada SO aktif tanpa invoice.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {salesCancelHits.map(({ so, products }) => {
                        const buyer = so.expand?.customer?.name?.trim() || "—";
                        return (
                          <li
                            key={so.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <Link
                                  href={salesOrderPreviewForReturUrl(so.id)}
                                  className="font-mono text-sm font-semibold text-slate-800 hover:underline"
                                >
                                  {so.order_no}
                                </Link>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {so.status}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  Belum invoice → bukan retur
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-800">{buyer}</p>
                              {products.length > 0 ? (
                                <ul className="space-y-0.5 text-sm text-slate-600">
                                  {products.slice(0, 3).map((p, i) => (
                                    <li key={`${so.id}-c-${i}`}>
                                      {p.name} · qty {p.qty}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <Link
                              href={salesOrderPreviewForReturUrl(so.id)}
                              className="shrink-0 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Batalkan SO
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-amber-50/80 px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Bisa diretur (ada tagihan)
                    </p>
                  </div>
                  {purchaseReturHits.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      Tidak ada tagihan aktif. Coba nomor tagihan atau nama pemasok.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {purchaseReturHits.map(({ bill, po, products }) => {
                        const supplier =
                          bill.expand?.supplier?.name?.trim() ||
                          po?.expand?.supplier?.name?.trim() ||
                          "—";
                        return (
                          <li
                            key={bill.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <Link
                                  href={billPreviewForReturUrl(bill.id)}
                                  className="font-mono text-sm font-semibold text-indigo-700 hover:underline"
                                >
                                  {bill.bill_no}
                                </Link>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {bill.status}
                                </span>
                              </div>
                              <p className="text-sm text-slate-800">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Pemasok
                                </span>
                                <span className="mt-0.5 block font-medium">{supplier}</span>
                              </p>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Produk
                                </p>
                                {products.length === 0 ? (
                                  <p className="mt-0.5 text-xs text-slate-400">—</p>
                                ) : (
                                  <ul className="mt-1 space-y-0.5">
                                    {products.map((p, i) => (
                                      <li key={`${bill.id}-${i}`} className="text-sm text-slate-700">
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-slate-400"> · </span>
                                        <span className="font-mono text-xs text-slate-500">{p.sku}</span>
                                        <span className="text-slate-400"> · </span>
                                        <span className="tabular-nums text-slate-600">qty {p.qty}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                            <Link
                              href={billPreviewForReturUrl(bill.id)}
                              className="shrink-0 self-start rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Lihat tagihan
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Belum tagihan — batalkan PO
                    </p>
                  </div>
                  {purchaseCancelHits.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      Tidak ada PO aktif tanpa tagihan.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {purchaseCancelHits.map(({ po, products }) => {
                        const supplier = po.expand?.supplier?.name?.trim() || "—";
                        return (
                          <li
                            key={po.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <Link
                                  href={purchaseOrderPreviewForReturUrl(po.id)}
                                  className="font-mono text-sm font-semibold text-slate-800 hover:underline"
                                >
                                  {po.po_no}
                                </Link>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {po.status}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  Belum bill → bukan retur
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-800">{supplier}</p>
                              {products.length > 0 ? (
                                <ul className="space-y-0.5 text-sm text-slate-600">
                                  {products.slice(0, 3).map((p, i) => (
                                    <li key={`${po.id}-c-${i}`}>
                                      {p.name} · qty {p.qty}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <Link
                              href={purchaseOrderPreviewForReturUrl(po.id)}
                              className="shrink-0 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Batalkan PO
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Standalone form */}
      {type && sourceMode === "standalone" ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSourceMode(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            ← Ganti sumber
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            {type === "penjualan" ? (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Pelanggan</span>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Pilih pelanggan</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Pemasok</span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Pilih pemasok</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Gudang</span>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Pilih gudang</option>
                {operationalWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Alasan</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Opsional"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Instruksi ke gudang</span>
              <input
                value={notesForWms}
                onChange={(e) => setNotesForWms(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Opsional — apa yang harus dicek gudang"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">Barang</p>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                placeholder="Cari produk (min. 2 huruf)…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
              />
              {productBusy ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              ) : null}
              {productHits.length > 0 ? (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                        <span>
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="mt-0.5 block font-mono text-xs text-slate-500">{p.sku}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada baris.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div
                    key={l.key}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-medium text-slate-800">{l.productName}</p>
                      <p className="font-mono text-xs text-slate-500">{l.sku}</p>
                    </div>
                    <label className="text-xs text-slate-500">
                      Qty
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) }
                                : x,
                            ),
                          )
                        }
                        className="mt-0.5 block w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitStandalone()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Buat retur mandiri
          </button>
        </div>
      ) : null}

      {soForModal ? (
        <SalesReturCreateModal
          open
          salesOrder={soForModal}
          onClose={() => {
            setSoForModal(null);
            if (soParam) router.replace(RETUR_MODULE.buat + "?type=penjualan&mode=doc");
          }}
          onCreated={(returId) => {
            setSoForModal(null);
            router.push(`${RETUR_MODULE.penjualan}/${returId}`);
          }}
        />
      ) : null}
    </div>
  );
}
