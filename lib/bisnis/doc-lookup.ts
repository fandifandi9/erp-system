import { pb } from "@/lib/pocketbase";
import {
  BISNIS_COLLECTIONS,
  type Invoice,
  type PurchaseBill,
  type PurchaseOrder,
  type SalesOrder,
} from "@/lib/bisnis/types";
import { escapePbFilter } from "@/lib/bisnis/doc-search";
import { canShowSalesReturUi } from "@/lib/bisnis/sales-retur-ui";
import { canCreatePurchaseRetur } from "@/lib/bisnis/purchase-retur-guards";

export type SalesDocLookup =
  | { mode: "invoice"; invoiceId: string; soId: string; docNo: string; canRetur: boolean }
  | { mode: "so"; soId: string; docNo: string; canRetur: boolean };

export type PurchaseDocLookup =
  | { mode: "bill"; billId: string; poId: string; docNo: string; canRetur: boolean }
  | { mode: "po"; poId: string; docNo: string; canRetur: boolean };

export async function lookupSalesDocByNumber(docNo: string): Promise<SalesDocLookup | null> {
  const q = docNo.trim();
  if (!q) return null;
  const esc = escapePbFilter(q);

  const invList = await pb.collection(BISNIS_COLLECTIONS.invoices).getList<Invoice>(1, 1, {
    filter: `invoice_no = "${esc}"`,
    requestKey: null,
  });
  const inv = invList.items[0];
  if (inv) {
    const soId = typeof inv.sales_order === "string" ? inv.sales_order : "";
    let canRetur = false;
    if (soId) {
      try {
        const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);
        canRetur = canShowSalesReturUi({ salesOrder: so, invoice: inv, hasInvoice: true });
      } catch {
        canRetur = false;
      }
    }
    return { mode: "invoice", invoiceId: inv.id, soId, docNo: inv.invoice_no, canRetur };
  }

  const soList = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 1, {
    filter: `order_no = "${esc}"`,
    requestKey: null,
  });
  const so = soList.items[0];
  if (so) {
    return {
      mode: "so",
      soId: so.id,
      docNo: so.order_no,
      canRetur: false,
    };
  }

  return null;
}

export async function lookupPurchaseDocByNumber(docNo: string): Promise<PurchaseDocLookup | null> {
  const q = docNo.trim();
  if (!q) return null;
  const esc = escapePbFilter(q);

  const billList = await pb.collection(BISNIS_COLLECTIONS.purchaseBills).getList<PurchaseBill>(1, 1, {
    filter: `bill_no = "${esc}"`,
    requestKey: null,
  });
  const bill = billList.items[0];
  if (bill) {
    const poId = typeof bill.purchase_order === "string" ? bill.purchase_order : "";
    let canRetur = false;
    if (poId) {
      try {
        const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
        canRetur = canCreatePurchaseRetur(po);
      } catch {
        canRetur = false;
      }
    }
    return { mode: "bill", billId: bill.id, poId, docNo: bill.bill_no, canRetur };
  }

  const poList = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getList<PurchaseOrder>(1, 1, {
    filter: `po_no = "${esc}"`,
    requestKey: null,
  });
  const po = poList.items[0];
  if (po) {
    return { mode: "po", poId: po.id, docNo: po.po_no, canRetur: canCreatePurchaseRetur(po) };
  }

  return null;
}
