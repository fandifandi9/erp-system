import { pb } from "@/lib/pocketbase";
import { ClientResponseError } from "pocketbase";
import {
  cancelWmsTasksForEntity,
  enqueueInboundFromPurchaseOrder,
  enqueueOutboundFromSalesOrder,
} from "@/lib/wms/fulfillment";
import {
  assertCashAccountBelongsToCompany,
  assertWarehouseBelongsToCompany,
  mergeCompanyFilter,
  mergeSalesCompanyFilter,
  resolveCompanyForBillPayment,
  resolveCompanyForExpense,
  resolveCompanyForInvoice,
  resolveCompanyForPayment,
  resolveCompanyForPurchaseBill,
  resolveCompanyForPurchaseOrder,
  resolveCompanyForSalesOrder,
} from "./entity-resolve";
import {
  BISNIS_COLLECTIONS,
  type Customer,
  type Supplier,
  type SalesOrder,
  type SalesOrderLine,
  type Invoice,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type Retur,
  type ReturLine,
  type ProductPrice,
  type Expense,
  type CreditNote,
  type PurchaseBill,
  type Store,
  type TaxRate,
  type PaymentTerm,
  type PaymentCondition,
  type PaymentMethodSetting,
} from "./types";
import { filterStoresForSales, filterSalesStoresByCompany, entityPlaceholderStoreNames } from "./store-filters";
import { fetchCompanyProfiles } from "./company-client";
import { shouldSyncCashInvoice } from "./invoice-status";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

/** Coba expand penuh dulu; jika field relation belum ada di PB, fallback ke expand minimal. */
async function getOneWithExpandFallback<T>(
  collection: string,
  id: string,
  expandCandidates: string[],
): Promise<T> {
  let lastErr: unknown;
  const candidates = expandCandidates.some((c) => c === "") ? expandCandidates : [...expandCandidates, ""];
  for (const expand of candidates) {
    try {
      return await pb.collection(collection).getOne<T>(
        id,
        expand ? { expand, requestKey: null } : { requestKey: null },
      );
    } catch (e) {
      lastErr = e;
      if (e instanceof ClientResponseError && (e.status === 400 || e.status === 404)) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

type ListOptions = {
  page?: number;
  perPage?: number;
  sort?: string;
  filter?: string;
  expand?: string;
  /** Scope entitas aktif — hanya record milik company ini. */
  companyId?: string;
  /** Toko penjualan entitas — untuk SO/invoice legacy tanpa field company. */
  storeIds?: string[];
};

const DEFAULT_PER_PAGE = 20;

function listOpts(opts?: ListOptions) {
  return {
    page: opts?.page ?? 1,
    perPage: opts?.perPage ?? DEFAULT_PER_PAGE,
    sort: opts?.sort ?? "-created",
    filter: mergeCompanyFilter(opts?.filter, opts?.companyId),
    expand: opts?.expand ?? "",
    requestKey: null,
  };
}

// ─── Customers ───

function cleanCustomerPayload(data: Partial<Customer>): Partial<Customer> {
  const out: Partial<Customer> = {};
  for (const [key, val] of Object.entries(data) as [keyof Customer, unknown][]) {
    if (val === undefined || val === null) continue;
    if (typeof val === "string" && val === "" && key !== "code" && key !== "name") continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[key] = val;
  }
  return out;
}

async function saveCustomer(
  mode: "create" | "update",
  data: Partial<Customer>,
  id?: string,
): Promise<Customer> {
  const payload = cleanCustomerPayload(data);
  const col = pb.collection(BISNIS_COLLECTIONS.customers);
  try {
    if (mode === "update" && id) {
      return await col.update<Customer>(id, payload);
    }
    return await col.create<Customer>(payload);
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400 && payload.customer_type) {
      console.error(`[${mode}Customer] customer_type rejected`, e.status, e.response, payload);
      throw new Error(
        "Tipe pelanggan (member/regular) gagal disimpan. Jalankan: node scripts/fix-pb-customers-schema.mjs",
      );
    }
    throw e;
  }
}

export async function fetchCustomers(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.customers).getList<Customer>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    listOpts(opts),
  );
}

export async function fetchCustomer(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.customers).getOne<Customer>(id, { requestKey: null });
}

export async function createCustomer(data: Partial<Customer>) {
  return saveCustomer("create", data);
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  return saveCustomer("update", data, id);
}

export async function deleteCustomer(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.customers).delete(id);
}

export async function fetchAllCustomers() {
  return pb.collection(BISNIS_COLLECTIONS.customers).getFullList<Customer>({
    sort: "name",
    requestKey: null,
  });
}

// ─── Suppliers ───

export async function fetchSuppliers(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).getList<Supplier>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    listOpts(opts),
  );
}

export async function fetchSupplier(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).getOne<Supplier>(id, { requestKey: null });
}

export async function createSupplier(data: Partial<Supplier>) {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).create<Supplier>(data);
}

export async function updateSupplier(id: string, data: Partial<Supplier>) {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).update<Supplier>(id, data);
}

export async function deleteSupplier(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).delete(id);
}

export async function fetchAllSuppliers() {
  return pb.collection(BISNIS_COLLECTIONS.suppliers).getFullList<Supplier>({
    sort: "name",
    requestKey: null,
  });
}

// ─── Sales Orders ───

export async function fetchSalesOrders(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      page: opts?.page ?? 1,
      perPage: opts?.perPage ?? DEFAULT_PER_PAGE,
      sort: opts?.sort ?? "-created",
      filter: mergeSalesCompanyFilter(opts?.filter, opts?.companyId, opts?.storeIds),
      expand: opts?.expand ?? "customer,warehouse,created_by",
      requestKey: null,
    },
  );
}

export async function fetchSalesOrder(id: string) {
  return getOneWithExpandFallback<SalesOrder>(BISNIS_COLLECTIONS.salesOrders, id, [
    "customer,warehouse,created_by,approved_by,store",
    "customer,warehouse,created_by,approved_by",
    "customer,warehouse,created_by",
  ]);
}

export async function createSalesOrder(data: Partial<SalesOrder>) {
  const company = await resolveCompanyForSalesOrder(data);
  if (data.warehouse && company) {
    await assertWarehouseBelongsToCompany(data.warehouse, company);
  }
  return pb.collection(BISNIS_COLLECTIONS.salesOrders).create<SalesOrder>({
    ...data,
    ...(company ? { company } : {}),
  });
}

export async function updateSalesOrder(id: string, data: Partial<SalesOrder>) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(id, data);
}

export async function deleteSalesOrder(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrders).delete(id);
}

// ─── Sales Order Lines ───

export async function fetchSalesOrderLines(salesOrderId: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${salesOrderId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
}

export async function createSalesOrderLine(
  data: Partial<SalesOrderLine>,
  opts?: { skipSerialValidation?: boolean },
) {
  if (data.product && data.qty && !opts?.skipSerialValidation) {
    const { assertSalesLineSerials, fetchRequiresSerialMap, serialsForSalesLine } =
      await import("@/lib/wms/serial-numbers");
    const requiresMap = await fetchRequiresSerialMap([data.product]);
    assertSalesLineSerials(
      [
        {
          product: data.product,
          qty: Number(data.qty) || 0,
          serial_numbers_json: data.serial_numbers_json,
          name: data.name_snapshot,
        },
      ],
      requiresMap,
      data.name_snapshot ? { [data.product]: data.name_snapshot } : undefined,
    );
    const sns = serialsForSalesLine({
      product: data.product,
      qty: Number(data.qty) || 0,
      serial_numbers_json: data.serial_numbers_json,
    });
    if (sns.length > 0 && !data.serial_numbers_json) {
      const { serializeSerialNumbersJson } = await import("@/lib/wms/serial-numbers");
      data = { ...data, serial_numbers_json: serializeSerialNumbersJson(sns) };
    }
  }
  return pb.collection(BISNIS_COLLECTIONS.salesOrderLines).create<SalesOrderLine>(data);
}

export async function updateSalesOrderLine(id: string, data: Partial<SalesOrderLine>) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrderLines).update<SalesOrderLine>(id, data);
}

export async function deleteSalesOrderLine(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesOrderLines).delete(id);
}

// ─── Invoices ───

export async function fetchInvoices(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.invoices).getList<Invoice>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      page: opts?.page ?? 1,
      perPage: opts?.perPage ?? DEFAULT_PER_PAGE,
      sort: opts?.sort ?? "-created",
      filter: mergeSalesCompanyFilter(opts?.filter, opts?.companyId, opts?.storeIds),
      expand: opts?.expand ?? "customer,sales_order",
      requestKey: null,
    },
  );
}

export async function fetchInvoice(id: string) {
  return getOneWithExpandFallback<Invoice>(BISNIS_COLLECTIONS.invoices, id, [
    "customer,sales_order,created_by,sales_channel,store_channel_account",
    "customer,sales_order,created_by",
    "customer,sales_order",
    "customer",
  ]);
}

export async function createInvoice(data: Partial<Invoice>) {
  const { generateInvoiceShareToken } = await import("./invoice-share-token");
  const company = await resolveCompanyForInvoice(data);
  return pb.collection(BISNIS_COLLECTIONS.invoices).create<Invoice>({
    ...data,
    ...(company ? { company } : {}),
    share_token: data.share_token?.trim() || generateInvoiceShareToken(),
  });
}

export async function updateInvoice(id: string, data: Partial<Invoice>) {
  return pb.collection(BISNIS_COLLECTIONS.invoices).update<Invoice>(id, data);
}

export async function deleteInvoice(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.invoices).delete(id);
}

/** Batalkan invoice (soft) — tetap bisa preview, tidak masuk laba rugi */
export async function cancelInvoice(invoice: Invoice, cancelReason?: string) {
  const soId = invoice.sales_order;
  if (soId) {
    const so = await fetchSalesOrder(soId);
    const lines = await fetchSalesOrderLines(soId);
    const voided = await voidStockMovementsByReference(
      {
        referenceId: soId,
        referenceType: "SALES_ORDER",
        referenceNo: so.order_no,
      },
      `Batal penjualan ${invoice.invoice_no}`,
    );
    if (voided === 0 && lines.length > 0 && so.warehouse) {
      const { resolveMovementLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
      const stockLines = await resolveMovementLinesFromSale(
        pb,
        lines.map((l) => ({ product: l.product, qty: l.qty, sales_order_line_id: l.id })),
      );
      await createAutoStockMovement({
        type: "PURCHASE",
        warehouse: so.warehouse,
        reference_type: "SALES_CANCEL",
        reference_id: soId,
        reference_no: invoice.invoice_no,
        lines: stockLines,
      });
    }
    await cancelWmsTasksForEntity("biz_sales_orders", soId);
  }
  await updateInvoice(invoice.id, {
    status: "cancelled",
    remaining: 0,
    cancel_reason: cancelReason?.trim() || "",
  });
  if (soId) {
    await updateSalesOrder(soId, { status: "cancelled" });
  }
}

/** Set invoice cash/term-0 ke status lunas jika belum */
export async function syncCashInvoiceStatus(invoice: Invoice) {
  if (!shouldSyncCashInvoice(invoice)) return invoice;
  return updateInvoice(invoice.id, {
    status: "paid",
    is_cash: true,
    paid_amount: invoice.total,
    remaining: 0,
  });
}

// ─── Payments ───

export type PaymentKind = "payment" | "refund";

export type Payment = {
  id: string;
  invoice: string;
  /** Entitas pemilik transaksi — derive dari invoice atau akun kas. */
  company?: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  payment_kind?: PaymentKind;
  /** Fee/denda tambahan saat pelunasan — Pendapatan Lain-lain periode berjalan. */
  fee_amount?: number;
  /** Akun kas/bank tujuan dana (biz_cash_accounts) — dipakai saldo kas. */
  cash_account?: string;
  reference_no?: string;
  notes?: string;
  created_by: string;
  created: string;
  expand?: {
    payment_method?: { id: string; code?: string; name: string };
    invoice?: { id: string; invoice_no?: string };
  };
};

export async function fetchPayments(invoiceId: string) {
  return pb.collection(BISNIS_COLLECTIONS.payments).getFullList<Payment>({
    filter: `invoice = "${invoiceId}"`,
    sort: "-payment_date",
    expand: "payment_method",
    requestKey: null,
  });
}

export async function createPayment(data: Partial<Payment>) {
  const company = await resolveCompanyForPayment(data);
  if (data.cash_account && company) {
    await assertCashAccountBelongsToCompany(data.cash_account, company);
  }
  return pb.collection(BISNIS_COLLECTIONS.payments).create<Payment>({
    ...data,
    ...(company ? { company } : {}),
  });
}

// ─── Purchase Orders ───

export async function fetchPurchaseOrders(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getList<PurchaseOrder>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      ...listOpts(opts),
      expand: opts?.expand ?? "supplier,warehouse,created_by",
    },
  );
}

export async function fetchPurchaseOrder(id: string) {
  return getOneWithExpandFallback<PurchaseOrder>(BISNIS_COLLECTIONS.purchaseOrders, id, [
    "supplier,warehouse,company,created_by,approved_by,warehouse_processed_by,receiving_warehouse",
    "supplier,warehouse,created_by,approved_by,warehouse_processed_by,receiving_warehouse",
    "supplier,warehouse,created_by,approved_by",
    "supplier,warehouse,created_by",
  ]);
}

export async function updatePurchaseOrderWithFiles(id: string, fd: FormData) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(id, fd);
}

export async function createPurchaseOrder(data: Partial<PurchaseOrder>) {
  const company = await resolveCompanyForPurchaseOrder(data);
  if (data.warehouse && company) {
    await assertWarehouseBelongsToCompany(data.warehouse, company);
  }
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).create<PurchaseOrder>({
    ...data,
    ...(company ? { company } : {}),
  });
}

export async function updatePurchaseOrder(id: string, data: Partial<PurchaseOrder>) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(id, data);
}

export async function deletePurchaseOrder(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).delete(id);
}

// ─── Purchase Order Lines ───

export async function fetchPurchaseOrderLines(poId: string) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList<PurchaseOrderLine>({
    filter: `purchase_order = "${poId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
}

export async function createPurchaseOrderLine(data: Partial<PurchaseOrderLine>) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).create<PurchaseOrderLine>(data);
}

export async function updatePurchaseOrderLine(id: string, data: Partial<PurchaseOrderLine>) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).update<PurchaseOrderLine>(id, data);
}

export async function deletePurchaseOrderLine(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).delete(id);
}

// ─── Returs ───

export async function fetchReturs(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      ...listOpts(opts),
      expand: opts?.expand ?? "customer,supplier,warehouse,created_by",
    },
  );
}

/** Retur penjualan terbuka untuk satu SO (draf / disetujui). */
export async function fetchOpenReturForSalesOrder(salesOrderId: string) {
  const res = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 1, {
    filter: `sales_order = "${salesOrderId}" && (status = "draft" || status = "approved")`,
    sort: "-created",
    requestKey: null,
  });
  return res.items[0] ?? null;
}

/** Semua retur penjualan untuk satu SO (riwayat + terbuka). */
export async function fetchRetursForSalesOrder(salesOrderId: string) {
  const res = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
    filter: `(sales_order = "${salesOrderId}" || reference_id = "${salesOrderId}") && type = "penjualan"`,
    sort: "-created",
    requestKey: null,
  });
  return res.items;
}

/** Peta SO id → retur terbuka (untuk badge di daftar pesanan). */
export async function fetchOpenRetursBySalesOrderIds(soIds: string[]) {
  const map = new Map<string, Retur>();
  if (!soIds.length) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < soIds.length; i += 15) {
    chunks.push(soIds.slice(i, i + 15));
  }
  for (const chunk of chunks) {
    const idFilter = chunk.map((id) => `sales_order = "${id}"`).join(" || ");
    const res = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, chunk.length * 2, {
      filter: `type = "penjualan" && (status = "draft" || status = "approved") && (${idFilter})`,
      sort: "-created",
      requestKey: null,
    });
    for (const r of res.items) {
      const soId = r.sales_order || r.reference_id;
      if (soId && !map.has(soId)) map.set(soId, r);
    }
  }
  return map;
}

export async function fetchRetur(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id, {
    expand: "customer,supplier,warehouse,created_by",
    requestKey: null,
  });
}

export async function createRetur(data: Partial<Retur>) {
  return pb.collection(BISNIS_COLLECTIONS.returs).create<Retur>(data);
}

export async function updateRetur(id: string, data: Partial<Retur>) {
  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(id, data);
}

export async function deleteRetur(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.returs).delete(id);
}

// ─── Retur Lines ───

export async function fetchReturLines(returId: string) {
  return pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: `retur = "${returId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
}

export async function createReturLine(data: Partial<ReturLine>) {
  return pb.collection(BISNIS_COLLECTIONS.returLines).create<ReturLine>(data);
}

export async function updateReturLine(id: string, data: Partial<ReturLine>) {
  return pb.collection(BISNIS_COLLECTIONS.returLines).update<ReturLine>(id, data);
}

export async function deleteReturLine(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.returLines).delete(id);
}

/** Credit notes terkait invoice (document chain). */
export async function fetchCreditNotesForInvoice(invoiceId: string) {
  const res = await pb.collection(BISNIS_COLLECTIONS.creditNotes).getList<CreditNote>(1, 50, {
    filter: `invoice = "${invoiceId}" && status != "cancelled"`,
    sort: "created",
    requestKey: null,
  });
  return res.items;
}

/** Retur penjualan terkait invoice. */
export async function fetchRetursForInvoice(invoiceId: string) {
  const res = await pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, 50, {
    filter: `invoice = "${invoiceId}" && type = "penjualan" && status != "cancelled"`,
    sort: "created",
    requestKey: null,
  });
  return res.items;
}

/** Baris retur untuk banyak retur sekaligus. */
export async function fetchReturLinesForReturIds(returIds: string[]) {
  if (!returIds.length) return [] as ReturLine[];
  const chunks: string[][] = [];
  for (let i = 0; i < returIds.length; i += 12) {
    chunks.push(returIds.slice(i, i + 12));
  }
  const all: ReturLine[] = [];
  for (const chunk of chunks) {
    const filter = chunk.map((id) => `retur = "${id}"`).join(" || ");
    const rows = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
      filter,
      requestKey: null,
    });
    all.push(...rows);
  }
  return all;
}

/** Biaya settlement terkait nomor retur. */
export async function fetchExpensesForReturNos(returNos: string[]) {
  const nos = returNos.map((n) => n.trim()).filter(Boolean);
  if (!nos.length) return [] as Expense[];
  const chunks: string[][] = [];
  for (let i = 0; i < nos.length; i += 12) {
    chunks.push(nos.slice(i, i + 12));
  }
  const all: Expense[] = [];
  for (const chunk of chunks) {
    const filter = chunk.map((n) => `reference_no = "${n.replace(/"/g, '\\"')}"`).join(" || ");
    const rows = await pb.collection(BISNIS_COLLECTIONS.expenses).getFullList<Expense>({
      filter,
      requestKey: null,
    });
    all.push(...rows);
  }
  return all;
}

export type InvoiceRelatedDocMap = Map<
  string,
  import("@/lib/bisnis/sales-document-chain").InvoiceRelatedIndicators
>;

/** Indikator dokumen turunan untuk banyak invoice (daftar penagihan). */
export async function fetchRelatedDocIndicatorsByInvoiceIds(
  invoiceIds: string[],
): Promise<InvoiceRelatedDocMap> {
  const map: InvoiceRelatedDocMap = new Map();
  if (!invoiceIds.length) return map;

  const { buildInvoiceRelatedIndicators } = await import("@/lib/bisnis/sales-document-chain");

  const chunks: string[][] = [];
  for (let i = 0; i < invoiceIds.length; i += 12) {
    chunks.push(invoiceIds.slice(i, i + 12));
  }

  const retursByInvoice = new Map<string, Retur[]>();
  const cnsByInvoice = new Map<string, CreditNote[]>();

  for (const chunk of chunks) {
    const invFilter = chunk.map((id) => `invoice = "${id}"`).join(" || ");
    const [returs, cns] = await Promise.all([
      pb.collection(BISNIS_COLLECTIONS.returs).getList<Retur>(1, chunk.length * 5, {
        filter: `type = "penjualan" && status != "cancelled" && (${invFilter})`,
        sort: "-created",
        requestKey: null,
      }),
      pb.collection(BISNIS_COLLECTIONS.creditNotes).getList<CreditNote>(1, chunk.length * 5, {
        filter: `status != "cancelled" && (${chunk.map((id) => `invoice = "${id}"`).join(" || ")})`,
        sort: "-created",
        requestKey: null,
      }),
    ]);
    for (const r of returs.items) {
      const invId = r.invoice;
      if (!invId) continue;
      const list = retursByInvoice.get(invId) ?? [];
      list.push(r);
      retursByInvoice.set(invId, list);
    }
    for (const cn of cns.items) {
      const invId = cn.invoice;
      if (!invId) continue;
      const list = cnsByInvoice.get(invId) ?? [];
      list.push(cn);
      cnsByInvoice.set(invId, list);
    }
  }

  for (const invId of invoiceIds) {
    const returs = retursByInvoice.get(invId) ?? [];
    const cns = cnsByInvoice.get(invId) ?? [];
    map.set(
      invId,
      buildInvoiceRelatedIndicators(returs, cns, []),
    );
  }

  return map;
}

/** Buat retur penjualan dari SO (server API). */
export async function createSalesReturFromOrderApi(
  salesOrderId: string,
  input?: import("@/lib/bisnis/sales-retur-expected").CreateSalesReturInput,
) {
  const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/retur`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: input ? JSON.stringify(input) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal membuat retur"));
  }
  return data.data as { retur: Retur; lines: ReturLine[] };
}

export async function createPurchaseReturFromOrderApi(purchaseOrderId: string) {
  const res = await fetch(`/api/bisnis/purchase-orders/${purchaseOrderId}/retur`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal membuat retur pembelian"));
  }
  return data.data as { retur: Retur; lines: ReturLine[] };
}

/** Selesaikan retur (penjualan / pembelian). */
export async function completeReturApi(returId: string) {
  const res = await fetch(`/api/bisnis/returs/${returId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal menyelesaikan retur"));
  }
  return data.data;
}

/** @deprecated gunakan completeReturApi */
export const completeSalesReturApi = completeReturApi;

export type WmsReceiveReturBody = {
  unboxing_video_path?: string;
  received_lines?: {
    line_id?: string;
    product: string;
    qty: number;
    condition?: "good" | "damaged";
  }[];
  wms_note?: string;
};

export async function confirmSalesReturnWmsReceiveApi(
  returId: string,
  body?: WmsReceiveReturBody,
) {
  const res = await fetch(`/api/bisnis/returs/${returId}/wms-receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal konfirmasi penerimaan retur"));
  }
  return data.data as Retur;
}

/** Posting settlement finance setelah stok retur sudah diposting. */
export async function settleSalesReturApi(returId: string) {
  const res = await fetch(`/api/bisnis/returs/${returId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal settlement retur"));
  }
  return data.data;
}

/** Selesaikan klarifikasi penerimaan PO (stok transit → disposition + tagihan). */
export async function finalizePurchaseReceivingApi(poId: string) {
  const res = await fetch(`/api/bisnis/purchase-orders/${poId}/finalize-receiving`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal menyelesaikan penerimaan"));
  }
  return data.data as { po: PurchaseOrder; billId?: string };
}

/** Batalkan retur (draf atau selesai). */
export async function cancelReturApi(returId: string, reason?: string) {
  const res = await fetch(`/api/bisnis/returs/${returId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason?.trim() || "" }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(String(data.error || "Gagal membatalkan retur"));
  }
  return data.data as Retur;
}

/** @deprecated gunakan cancelReturApi */
export const cancelSalesReturApi = cancelReturApi;

// ─── Product Prices ───

export async function fetchProductPrices(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.productPrices).getList<ProductPrice>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      ...listOpts(opts),
      expand: opts?.expand ?? "product",
    },
  );
}

export async function fetchProductPricesByProduct(productId: string) {
  return pb.collection(BISNIS_COLLECTIONS.productPrices).getFullList<ProductPrice>({
    filter: `product = "${productId}"`,
    sort: "price_level",
    requestKey: null,
  });
}

export async function createProductPrice(data: Partial<ProductPrice>) {
  return pb.collection(BISNIS_COLLECTIONS.productPrices).create<ProductPrice>(data);
}

export async function updateProductPrice(id: string, data: Partial<ProductPrice>) {
  return pb.collection(BISNIS_COLLECTIONS.productPrices).update<ProductPrice>(id, data);
}

export async function deleteProductPrice(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.productPrices).delete(id);
}

// ─── Expenses / Biaya ───

export async function fetchExpenses(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.expenses).getList<Expense>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      ...listOpts(opts),
      expand: opts?.expand ?? "supplier,created_by",
    },
  );
}

export async function fetchExpense(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.expenses).getOne<Expense>(id, {
    expand: "supplier,created_by,approved_by",
    requestKey: null,
  });
}

export async function createExpense(data: Partial<Expense>) {
  const { prepareExpensePayload } = await import("./expense-posting");
  const payload = await prepareExpensePayload(data);
  return pb.collection(BISNIS_COLLECTIONS.expenses).create<Expense>(payload);
}

export async function updateExpense(id: string, data: Partial<Expense>) {
  const { prepareExpensePayload } = await import("./expense-posting");
  const prev = await pb
    .collection(BISNIS_COLLECTIONS.expenses)
    .getOne<Expense>(id, { fields: "status,cash_account,total", requestKey: null })
    .catch(() => null);
  const payload = await prepareExpensePayload(data, { isUpdate: true, prev: prev ?? undefined });
  return pb.collection(BISNIS_COLLECTIONS.expenses).update<Expense>(id, payload);
}

export async function deleteExpense(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.expenses).delete(id);
}

// ─── Purchase Bills / Tagihan Pembelian ───

export async function fetchPurchaseBills(opts?: ListOptions) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseBills).getList<PurchaseBill>(
    opts?.page ?? 1,
    opts?.perPage ?? DEFAULT_PER_PAGE,
    {
      ...listOpts(opts),
      expand: opts?.expand ?? "supplier,purchase_order.warehouse",
    },
  );
}

export async function fetchPurchaseBill(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseBills).getOne<PurchaseBill>(id, {
    expand: "supplier,purchase_order.warehouse,created_by",
    requestKey: null,
  });
}

export async function createPurchaseBill(data: Partial<PurchaseBill>) {
  const company = await resolveCompanyForPurchaseBill(data);
  return pb.collection(BISNIS_COLLECTIONS.purchaseBills).create<PurchaseBill>({
    ...data,
    ...(company ? { company } : {}),
  });
}

export async function updatePurchaseBill(id: string, data: Partial<PurchaseBill>) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseBills).update<PurchaseBill>(id, data);
}

export async function deletePurchaseBill(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.purchaseBills).delete(id);
}

/** Batalkan tagihan pembelian (soft) — stok dikembalikan (keluar gudang). */
export async function cancelPurchaseBill(bill: PurchaseBill, cancelReason?: string) {
  const poId = bill.purchase_order;
  if (poId) {
    const po = await fetchPurchaseOrder(poId);
    const lines = await fetchPurchaseOrderLines(poId);
    const voided = await voidStockMovementsByReference(
      {
        referenceId: poId,
        referenceType: "PURCHASE_ORDER",
        referenceNo: po.po_no,
      },
      `Batal pembelian ${bill.bill_no}`,
    );
    if (voided === 0 && lines.length > 0 && po.warehouse) {
      await createAutoStockMovement({
        type: "SALE",
        warehouse: po.warehouse,
        reference_type: "PURCHASE_CANCEL",
        reference_id: poId,
        reference_no: bill.bill_no,
        lines: lines.map((l) => ({ product: l.product, qty: l.qty })),
      });
    }
    await cancelWmsTasksForEntity("biz_purchase_orders", poId);
  }
  await updatePurchaseBill(bill.id, {
    status: "cancelled",
    remaining: 0,
    paid_amount: bill.paid_amount,
    cancel_reason: cancelReason?.trim() || "",
  });
  if (!poId) return;

  await updatePurchaseOrder(poId, { status: "cancelled" });
}

export type BillPayment = {
  id: string;
  purchase_bill: string;
  /** Entitas pemilik transaksi — derive dari bill atau akun kas. */
  company?: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  /** Akun kas/bank sumber dana (biz_cash_accounts) — dipakai saldo kas. */
  cash_account?: string;
  reference_no?: string;
  notes?: string;
  created_by: string;
  created: string;
  expand?: {
    payment_method?: { id: string; code?: string; name: string };
    cash_account?: { id: string; name: string };
  };
};

export async function fetchBillPayments(billId: string) {
  return pb.collection(BISNIS_COLLECTIONS.billPayments).getFullList<BillPayment>({
    filter: `purchase_bill = "${billId}"`,
    sort: "-payment_date",
    expand: "payment_method,cash_account",
    requestKey: null,
  });
}

export async function createBillPayment(data: Partial<BillPayment>) {
  const company = await resolveCompanyForBillPayment(data);
  if (data.cash_account && company) {
    await assertCashAccountBelongsToCompany(data.cash_account, company);
  }
  return pb.collection(BISNIS_COLLECTIONS.billPayments).create<BillPayment>({
    ...data,
    ...(company ? { company } : {}),
  });
}

export {
  cancelPurchaseOrderWithoutBill,
  createBillFromPurchaseOrder,
  fetchPurchaseBillByPurchaseOrder,
  canEditPurchaseOrder,
} from "./purchase-from-po";

export {
  sendPurchaseOrderToWarehouse,
  updateWarehouseProcess,
  canSendPurchaseOrderToWarehouse,
  canCreateBillFromPurchaseOrder,
  billBlockedReason,
  getWarehouseProcessStatus,
  getPurchaseWmsDisplayStatus,
  WAREHOUSE_PROCESS_STATUS_UI,
  purchaseOrdersReceivingPbFilter,
  fmtWarehouseProcessedAt,
} from "./purchase-warehouse";

export {
  cancelSalesOrderWithoutInvoice,
  createInvoiceFromSalesOrder,
  fetchInvoiceBySalesOrder,
  canEditSalesOrder,
} from "./sales-from-so";

export {
  sendSalesOrderToWarehouse,
  canSendSalesOrderToWarehouse,
  canCreateInvoiceFromSalesOrder,
  invoiceBlockedReason,
  getSalesWarehouseStatus,
  getSalesWmsDisplayStatus,
  SALES_WAREHOUSE_STATUS_UI,
  salesOrdersPickingPbFilter,
} from "./sales-warehouse";

export {
  getPurchaseOrderDocStatus,
  getSalesOrderDocStatus,
  canEditPurchaseOrderDoc,
  canEditSalesOrderDoc,
  ORDER_DOC_STATUS_UI,
  purchaseOrderFilterToPb,
  salesOrderFilterToPb,
  ORDER_DOC_STATUS_FILTER,
  OPEN_ORDER_DOC_STATUS_FILTER,
  openSalesOrdersListFilterToPb,
  openPurchaseOrdersListFilterToPb,
} from "./order-doc-status";

export {
  WMS_ROUTE_FILTER,
  wmsOrderFilterToPb,
  invoiceWmsFilterToPb,
  purchaseBillWmsFilterToPb,
  getWmsRouteBadge,
  matchesWmsRouteFilter,
  isWmsSchemaFilterError,
} from "./wms-order-filters";

// ─── Aggregates / Stats ───

export async function getCustomerCount() {
  const r = await pb.collection(BISNIS_COLLECTIONS.customers).getList(1, 1, { requestKey: null });
  return r.totalItems;
}

export async function getActiveCustomerCount() {
  const r = await pb.collection(BISNIS_COLLECTIONS.customers).getList(1, 1, {
    filter: "is_active = true",
    requestKey: null,
  });
  return r.totalItems;
}

export async function getSupplierCount() {
  const r = await pb.collection(BISNIS_COLLECTIONS.suppliers).getList(1, 1, { requestKey: null });
  return r.totalItems;
}

export async function getActiveSupplierCount() {
  const r = await pb.collection(BISNIS_COLLECTIONS.suppliers).getList(1, 1, {
    filter: "is_active = true",
    requestKey: null,
  });
  return r.totalItems;
}

function bizStockAuthHeaders(): Record<string, string> {
  const token = pb.authStore.token;
  if (!token) throw new Error("User belum login");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function readApiJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      raw?.trim().startsWith("<")
        ? "Server mengembalikan HTML error (bukan JSON). Cek log terminal `npm run dev`."
        : "Respons API tidak valid JSON.",
    );
  }
}

/** Void semua mutasi stok terposting yang terkait PO/SO (pembatalan & edit). */
export async function voidStockMovementsByReference(
  ref: { referenceId?: string; referenceType?: string; referenceNo?: string },
  note?: string,
): Promise<number> {
  const userId = pb.authStore.model?.id;
  if (!userId) throw new Error("User belum login");

  const res = await fetch("/api/inventory/movements/void-by-reference", {
    method: "POST",
    headers: bizStockAuthHeaders(),
    body: JSON.stringify({
      reference_id: ref.referenceId,
      reference_type: ref.referenceType,
      reference_no: ref.referenceNo,
      note,
      user_id: userId,
    }),
  });

  const data = await readApiJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      String(data.error || "") ||
        "Gagal membatalkan mutasi stok. Pastikan POCKETBASE_ADMIN_EMAIL/PASSWORD di .env.local.",
    );
  }
  const payload = data.data as { voided_count?: number } | undefined;
  return Number(payload?.voided_count ?? 0);
}

/**
 * Auto-create and post stock movement from a sales or purchase transaction.
 * SALE → stock OUT, PURCHASE → stock IN.
 */
export async function createAutoStockMovement(params: {
  type: "SALE" | "PURCHASE";
  warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: { product: string; qty: number }[];
}) {
  const userId = pb.authStore.model?.id;
  if (!userId) throw new Error("User belum login");

  const res = await fetch("/api/inventory/movements/auto-stock", {
    method: "POST",
    headers: bizStockAuthHeaders(),
    body: JSON.stringify({ ...params, user_id: userId }),
  });

  const data = await readApiJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      String(data.error || "") ||
        "Gagal membuat pergerakan stok otomatis. Pastikan POCKETBASE_ADMIN_EMAIL/PASSWORD di .env.local.",
    );
  }
  return data;
}

export async function createAutoTransferMovement(params: {
  from_warehouse: string;
  to_warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: { product: string; qty: number }[];
  note_suffix?: string;
}) {
  const userId = pb.authStore.model?.id;
  if (!userId) throw new Error("User belum login");

  const res = await fetch("/api/inventory/movements/auto-transfer", {
    method: "POST",
    headers: bizStockAuthHeaders(),
    body: JSON.stringify({ ...params, user_id: userId }),
  });

  const data = await readApiJsonSafe(res);
  if (!res.ok) {
    throw new Error(
      String(data.error || "") ||
        "Gagal membuat transfer stok otomatis. Pastikan POCKETBASE_ADMIN_EMAIL/PASSWORD di .env.local.",
    );
  }
  return data;
}

/** Stok pusat + antrean WMS setelah penjualan tersimpan. */
export async function applySalesStockAndWms(
  soId: string,
  userId: string,
  movement: {
    warehouse: string;
    reference_no: string;
    lines: { product: string; qty: number }[];
  },
) {
  await createAutoStockMovement({
    type: "SALE",
    warehouse: movement.warehouse,
    reference_type: "SALES_ORDER",
    reference_id: soId,
    reference_no: movement.reference_no,
    lines: movement.lines,
  });
  await enqueueOutboundFromSalesOrder(soId, userId);
}

/** Stok pusat saja — tanpa antrean WMS (kirim picking manual). */
export async function applySalesStockOnly(
  soId: string,
  movement: {
    warehouse: string;
    reference_no: string;
    lines: { product: string; qty: number; sales_order_line_id?: string }[];
  },
) {
  const { resolveMovementLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
  const lines = await resolveMovementLinesFromSale(pb, movement.lines);
  await createAutoStockMovement({
    type: "SALE",
    warehouse: movement.warehouse,
    reference_type: "SALES_ORDER",
    reference_id: soId,
    reference_no: movement.reference_no,
    lines,
  });
}

/** Stok pusat saja — tanpa antrean WMS (WMS sudah di-enqueue saat kirim ke gudang). */
export async function applyPurchaseStockOnly(
  poId: string,
  movement: {
    warehouse: string;
    reference_no: string;
    lines: { product: string; qty: number }[];
  },
) {
  await createAutoStockMovement({
    type: "PURCHASE",
    warehouse: movement.warehouse,
    reference_type: "PURCHASE_ORDER",
    reference_id: poId,
    reference_no: movement.reference_no,
    lines: movement.lines,
  });
}

/** Stok pusat + antrean WMS setelah pembelian tersimpan (mode langsung / legacy). */
export async function applyPurchaseStockAndWms(
  poId: string,
  userId: string,
  movement: {
    warehouse: string;
    reference_no: string;
    lines: { product: string; qty: number }[];
  },
) {
  await createAutoStockMovement({
    type: "PURCHASE",
    warehouse: movement.warehouse,
    reference_type: "PURCHASE_ORDER",
    reference_id: poId,
    reference_no: movement.reference_no,
    lines: movement.lines,
  });
  await enqueueInboundFromPurchaseOrder(poId, userId);
}

/** Batalkan mutasi lama lalu terapkan mutasi baru (edit transaksi). */
export async function replaceAutoStockMovement(params: {
  type: "SALE" | "PURCHASE";
  warehouse: string;
  reference_type: string;
  reference_id: string;
  reference_no: string;
  lines: { product: string; qty: number }[];
  voidNote?: string;
}) {
  const { voidNote, ...movement } = params;
  await voidStockMovementsByReference(
    {
      referenceId: movement.reference_id,
      referenceType: movement.reference_type,
      referenceNo: movement.reference_no,
    },
    voidNote || `Update stok ${movement.reference_no}`,
  );
  if (!movement.warehouse || movement.lines.length === 0) return null;
  return createAutoStockMovement(movement);
}

// ── Store ──

export async function fetchStores(activeOnly = true, companyId?: string) {
  const parts: string[] = [];
  if (activeOnly) parts.push("is_active = true");
  if (companyId) parts.push(`company = "${companyId}"`);
  const res = await pb.collection(BISNIS_COLLECTIONS.stores).getFullList<Store>({
    sort: "name",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "default_warehouse",
    requestKey: null,
  });
  return res;
}

/** Toko penjualan aktif — bukan placeholder entitas; legacy tanpa field company tetap muncul. */
export async function fetchSalesStores(companyId?: string) {
  const [storesAll, warehouses, profiles] = await Promise.all([
    fetchStores(true),
    pb.collection(INV_COLLECTIONS.warehouses).getFullList<{
      id: string;
      store?: string;
      warehouse_role?: string;
    }>({
      fields: "id,store,warehouse_role",
      requestKey: null,
    }),
    fetchCompanyProfiles(true).catch(() => [] as { company_name: string }[]),
  ]);
  const entityNames = entityPlaceholderStoreNames(profiles);
  const scoped = filterSalesStoresByCompany(storesAll, companyId);
  return filterStoresForSales(scoped, warehouses, entityNames).sort((a, b) =>
    a.name.localeCompare(b.name, "id"),
  );
}

export async function fetchStore(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.stores).getOne<Store>(id, {
    expand: "default_warehouse",
    requestKey: null,
  });
}

export async function createStore(data: Partial<Store>) {
  return pb.collection(BISNIS_COLLECTIONS.stores).create<Store>(data);
}

export async function updateStore(id: string, data: Partial<Store>) {
  return pb.collection(BISNIS_COLLECTIONS.stores).update<Store>(id, data);
}

export async function deleteStore(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.stores).delete(id);
}

// ── Tax Rates ──

export async function fetchTaxRates(activeOnly = true) {
  return pb.collection(BISNIS_COLLECTIONS.taxRates).getFullList<TaxRate>({
    sort: "rate",
    filter: activeOnly ? "is_active = true" : undefined,
    requestKey: null,
  });
}

export async function createTaxRate(data: Partial<TaxRate>) {
  return pb.collection(BISNIS_COLLECTIONS.taxRates).create<TaxRate>(data);
}

export async function updateTaxRate(id: string, data: Partial<TaxRate>) {
  return pb.collection(BISNIS_COLLECTIONS.taxRates).update<TaxRate>(id, data);
}

export async function deleteTaxRate(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.taxRates).delete(id);
}

// ── Payment Terms ──

export async function fetchPaymentTerms(activeOnly = true) {
  return pb.collection(BISNIS_COLLECTIONS.paymentTerms).getFullList<PaymentTerm>({
    sort: "days",
    filter: activeOnly ? "is_active = true" : undefined,
    requestKey: null,
  });
}

export async function createPaymentTerm(data: Partial<PaymentTerm>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentTerms).create<PaymentTerm>(data);
}

export async function updatePaymentTerm(id: string, data: Partial<PaymentTerm>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentTerms).update<PaymentTerm>(id, data);
}

export async function deletePaymentTerm(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.paymentTerms).delete(id);
}

// ── Payment Conditions ──

export async function fetchPaymentConditions(activeOnly = true) {
  return pb.collection(BISNIS_COLLECTIONS.paymentConditions).getFullList<PaymentCondition>({
    sort: "name",
    filter: activeOnly ? "is_active = true" : undefined,
    requestKey: null,
  });
}

export async function createPaymentCondition(data: Partial<PaymentCondition>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentConditions).create<PaymentCondition>(data);
}

export async function updatePaymentCondition(id: string, data: Partial<PaymentCondition>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentConditions).update<PaymentCondition>(id, data);
}

export async function deletePaymentCondition(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.paymentConditions).delete(id);
}

// ── Payment Methods ──

export async function fetchPaymentMethods(activeOnly = true) {
  return pb.collection(BISNIS_COLLECTIONS.paymentMethods).getFullList<PaymentMethodSetting>({
    sort: "name",
    filter: activeOnly ? "is_active = true" : undefined,
    requestKey: null,
  });
}

export async function createPaymentMethod(data: Partial<PaymentMethodSetting>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentMethods).create<PaymentMethodSetting>(data);
}

export async function updatePaymentMethod(id: string, data: Partial<PaymentMethodSetting>) {
  return pb.collection(BISNIS_COLLECTIONS.paymentMethods).update<PaymentMethodSetting>(id, data);
}

export async function deletePaymentMethod(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.paymentMethods).delete(id);
}

export {
  fetchSalesChannels,
  createSalesChannel,
  updateSalesChannel,
  deleteSalesChannel,
  fetchMpSellerTiers,
  createMpSellerTier,
  updateMpSellerTier,
  deleteMpSellerTier,
  fetchStoreChannelAccounts,
  fetchStoreChannelAccount,
  createStoreChannelAccount,
  updateStoreChannelAccount,
  deleteStoreChannelAccount,
  fetchMpFeeRules,
  createMpFeeRule,
  updateMpFeeRule,
  deleteMpFeeRule,
  fetchMpProductMappings,
  createMpProductMapping,
  updateMpProductMapping,
  deleteMpProductMapping,
  fetchSalesImportBatches,
  fetchSalesImportBatch,
  createSalesImportBatch,
  updateSalesImportBatch,
  fetchSalesImportLines,
  createSalesImportLine,
  updateSalesImportLine,
  processImportRows,
  createImportBatchFromFile,
  cancelSalesImportBatch,
} from "./mp-client";

export { postSalesImportBatch } from "./mp-import-post";
export {
  fetchPaymentImportBatches,
  fetchPaymentImportBatch,
  createPaymentImportBatch,
  updatePaymentImportBatch,
  fetchPaymentImportLines,
  createPaymentImportLine,
  updatePaymentImportLine,
  processPaymentImportRows,
  createPaymentImportBatchFromFile,
  cancelPaymentImportBatch,
} from "./payment-import-client";
export { postPaymentImportBatch } from "./payment-import-post";
export {
  salesBatchToActivity,
  paymentBatchToActivity,
  salesImportTargets,
  paymentImportTargets,
  resolveImportDisplayStatus,
  IMPORT_DISPLAY_STATUS_UI,
  type ImportActivityRow,
  type ImportActivityKind,
  type ImportDisplayStatus,
  fetchImportActivityRows,
} from "./import-activity";
export { parsePaymentImportFile, PAYMENT_IMPORT_TEMPLATE_HEADERS } from "./payment-import-parse";
export { calculateOrderFees, pickBestRule, calcFeeAmount } from "./mp-fee-engine";
export {
  fetchMpFeeTemplates,
  createMpFeeTemplate,
  updateMpFeeTemplate,
  deleteMpFeeTemplate,
  fetchMpFeeTemplateLines,
  createMpFeeTemplateLine,
  updateMpFeeTemplateLine,
  deleteMpFeeTemplateLine,
  seedShopeeMallTemplate,
} from "./mp-template-client";
export { calculateTemplateOrderFees, simulateTemplateFees } from "./mp-template-engine";
export { parseSalesImportFile, importTemplateCsv, IMPORT_TEMPLATE_HEADERS } from "./mp-import-parse";
