import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { parseIdentitySnapshot } from "@/lib/tenant/document-identity";
import {
  BISNIS_COLLECTIONS,
  type Expense,
  type Invoice,
  type PurchaseBill,
  type PurchaseOrder,
  type SalesOrder,
} from "./types";

export async function fetchStoreCompany(storeId: string): Promise<string | null> {
  const row = await pb
    .collection(BISNIS_COLLECTIONS.stores)
    .getOne(storeId, { fields: "company", requestKey: null })
    .catch(() => null);
  return (row as { company?: string } | null)?.company || null;
}

export async function fetchWarehouseCompany(warehouseId: string): Promise<string | null> {
  const row = await pb
    .collection(INV_COLLECTIONS.warehouses)
    .getOne(warehouseId, { fields: "company", requestKey: null })
    .catch(() => null);
  return (row as { company?: string } | null)?.company || null;
}

export async function fetchCashAccountCompany(cashAccountId: string): Promise<string | null> {
  const row = await pb
    .collection(BISNIS_COLLECTIONS.cashAccounts)
    .getOne(cashAccountId, { fields: "company", requestKey: null })
    .catch(() => null);
  return (row as { company?: string } | null)?.company || null;
}

export async function fetchInvoiceCompany(invoiceId: string): Promise<string | null> {
  const row = await pb
    .collection(BISNIS_COLLECTIONS.invoices)
    .getOne(invoiceId, { fields: "company,store,identity_snapshot_json", requestKey: null })
    .catch(() => null);
  if (!row) return null;
  const inv = row as Pick<Invoice, "company" | "store" | "identity_snapshot_json">;
  if (inv.company) return inv.company;
  if (inv.store) return fetchStoreCompany(inv.store);
  const snap = parseIdentitySnapshot(inv.identity_snapshot_json);
  return snap?.company_id || null;
}

export async function fetchPurchaseBillCompany(billId: string): Promise<string | null> {
  const row = await pb
    .collection(BISNIS_COLLECTIONS.purchaseBills)
    .getOne(billId, { fields: "company,purchase_order", requestKey: null })
    .catch(() => null);
  if (!row) return null;
  const bill = row as Pick<PurchaseBill, "company" | "purchase_order">;
  if (bill.company) return bill.company;
  if (bill.purchase_order) return fetchPurchaseOrderCompany(bill.purchase_order);
  return null;
}

export async function fetchPurchaseOrderCompany(poId: string): Promise<string | null> {
  const row = await pb
    .collection(BISNIS_COLLECTIONS.purchaseOrders)
    .getOne(poId, { fields: "company,warehouse", requestKey: null })
    .catch(() => null);
  if (!row) return null;
  const po = row as unknown as Pick<PurchaseOrder, "company" | "warehouse">;
  if (po.company) return po.company;
  if (po.warehouse) return fetchWarehouseCompany(po.warehouse);
  return null;
}

export async function resolveCompanyForSalesOrder(
  data: Partial<SalesOrder>,
): Promise<string | undefined> {
  if (data.company) return data.company;
  if (data.warehouse) {
    const c = await fetchWarehouseCompany(data.warehouse);
    if (c) return c;
  }
  if (data.store) {
    const c = await fetchStoreCompany(data.store);
    if (c) return c;
  }
  return undefined;
}

export async function resolveCompanyForInvoice(data: Partial<Invoice>): Promise<string | undefined> {
  if (data.company) return data.company;
  const snap = parseIdentitySnapshot(data.identity_snapshot_json);
  if (snap?.company_id) return snap.company_id;
  if (data.store) {
    const c = await fetchStoreCompany(data.store);
    if (c) return c;
  }
  if (data.sales_order) {
    const so = await pb
      .collection(BISNIS_COLLECTIONS.salesOrders)
      .getOne(data.sales_order, { fields: "company,warehouse,store", requestKey: null })
      .catch(() => null);
    if (so) return resolveCompanyForSalesOrder(so as Partial<SalesOrder>);
  }
  return undefined;
}

export async function resolveCompanyForPurchaseOrder(
  data: Partial<PurchaseOrder>,
): Promise<string | undefined> {
  if (data.company) return data.company;
  if (data.warehouse) {
    const c = await fetchWarehouseCompany(data.warehouse);
    if (c) return c;
  }
  return undefined;
}

export async function resolveCompanyForPurchaseBill(
  data: Partial<PurchaseBill>,
): Promise<string | undefined> {
  if (data.company) return data.company;
  if (data.purchase_order) {
    const c = await fetchPurchaseOrderCompany(data.purchase_order);
    if (c) return c;
  }
  return undefined;
}

export async function resolveCompanyForPayment(input: {
  company?: string;
  invoice?: string;
  cash_account?: string;
}): Promise<string | undefined> {
  if (input.company) return input.company;
  if (input.invoice) {
    const c = await fetchInvoiceCompany(input.invoice);
    if (c) return c;
  }
  if (input.cash_account) {
    const c = await fetchCashAccountCompany(input.cash_account);
    if (c) return c;
  }
  return undefined;
}

export async function resolveCompanyForBillPayment(input: {
  company?: string;
  purchase_bill?: string;
  cash_account?: string;
}): Promise<string | undefined> {
  if (input.company) return input.company;
  if (input.purchase_bill) {
    const c = await fetchPurchaseBillCompany(input.purchase_bill);
    if (c) return c;
  }
  if (input.cash_account) {
    const c = await fetchCashAccountCompany(input.cash_account);
    if (c) return c;
  }
  return undefined;
}

export async function resolveCompanyForExpense(data: Partial<Expense>): Promise<string | undefined> {
  if (data.company) return data.company;
  if (data.store) {
    const c = await fetchStoreCompany(data.store);
    if (c) return c;
  }
  return undefined;
}

export async function assertWarehouseBelongsToCompany(
  warehouseId: string,
  companyId: string,
): Promise<void> {
  const whCompany = await fetchWarehouseCompany(warehouseId);
  if (!whCompany) throw new Error("Gudang tidak ditemukan");
  if (whCompany !== companyId) {
    throw new Error("Gudang tidak milik entitas yang sama dengan transaksi");
  }
}

export async function assertCashAccountBelongsToCompany(
  cashAccountId: string,
  companyId: string,
): Promise<void> {
  const caCompany = await fetchCashAccountCompany(cashAccountId);
  if (!caCompany) throw new Error("Akun kas/bank tidak ditemukan");
  if (caCompany !== companyId) {
    throw new Error("Akun kas/bank tidak milik entitas yang sama dengan transaksi");
  }
}

/** Gabung filter PocketBase dengan scope entitas. */
export function mergeCompanyFilter(filter: string | undefined, companyId?: string | null): string {
  if (!companyId) return filter?.trim() || "";
  const cf = `company = "${companyId}"`;
  const base = filter?.trim();
  return base ? `(${base}) && ${cf}` : cf;
}

/**
 * Scope penjualan (SO/invoice): entitas + record legacy tanpa company
 * yang toko-nya milik entitas aktif.
 */
export function mergeSalesCompanyFilter(
  filter: string | undefined,
  companyId?: string | null,
  storeIds?: string[],
): string {
  if (!companyId) return filter?.trim() || "";
  let scope: string;
  if (storeIds && storeIds.length > 0) {
    const storeOr = storeIds.map((id) => `store = "${id}"`).join(" || ");
    scope = `(company = "${companyId}" || ((${storeOr}) && (company = null || company = "")))`;
  } else {
    scope = `(company = "${companyId}" || company = null || company = "")`;
  }
  const base = filter?.trim();
  return base ? `(${base}) && ${scope}` : scope;
}
