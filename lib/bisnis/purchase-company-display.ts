type CompanyExpand = { company_name?: string };

type WithCompanyExpand = {
  expand?: {
    company?: CompanyExpand;
    purchase_order?: {
      expand?: {
        company?: CompanyExpand;
      };
    };
  };
};

/** Nama PT/CV pembeli untuk daftar tagihan / PO. */
export function resolvePurchaseCompanyName(row: WithCompanyExpand): string {
  return (
    row.expand?.company?.company_name ??
    row.expand?.purchase_order?.expand?.company?.company_name ??
    "—"
  );
}

export const PURCHASE_BILL_EXPAND =
  "supplier,company,purchase_order,purchase_order.company,purchase_order.warehouse";

export const PURCHASE_ORDER_LIST_EXPAND = "supplier,company,warehouse";
