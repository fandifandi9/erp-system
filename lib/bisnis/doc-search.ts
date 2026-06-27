/** Escape string untuk literal filter PocketBase. */
export function escapePbFilter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** `(field1 ~ "q" || field2 ~ "q" || …)` — kosong jika query kosong. */
export function buildDocSearchFilter(search: string, fields: readonly string[]): string {
  const q = search.trim();
  if (!q) return "";
  const escaped = escapePbFilter(q);
  return `(${fields.map((f) => `${f} ~ "${escaped}"`).join(" || ")})`;
}

export const SALES_ORDER_SEARCH_FIELDS = ["order_no", "customer.name", "notes"] as const;
export const INVOICE_SEARCH_FIELDS = ["invoice_no", "customer.name", "mp_order_no", "notes"] as const;
export const PURCHASE_ORDER_SEARCH_FIELDS = ["po_no", "supplier.name", "notes"] as const;
export const PURCHASE_BILL_SEARCH_FIELDS = ["bill_no", "supplier.name", "notes"] as const;
