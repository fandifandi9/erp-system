import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  BISNIS_COLLECTIONS,
  type Invoice,
  type PurchaseOrder,
  type SalesOrder,
  type Store,
} from "@/lib/bisnis/types";
import { isResendConfigured } from "@/lib/email/resend";
import {
  buildShareDocEmailHtml,
  buildShareDocEmailText,
  type ShareEmailDoc,
} from "@/lib/email/share-doc-html";
import type { EmailDocKind } from "@/lib/email/document-kind";
import { resolveEmailSender } from "@/lib/email/sender";
import { sendViaResend } from "@/lib/email/send-via-resend";
import {
  invoiceSharePublicPath,
  purchaseOrderSharePublicPath,
  quotationSharePublicPath,
  salesOrderSharePublicPath,
} from "@/lib/bisnis/doc-share";

export type SendDocumentEmailInput = {
  kind: EmailDocKind;
  id: string;
  to: string;
  baseUrl: string;
};

export type SendDocumentEmailResult = {
  ok: true;
  to: string;
  id: string;
};

async function loadStoreForWarehouse(
  pb: Awaited<ReturnType<typeof getInventoryAdminPb>>,
  warehouseId?: string,
): Promise<Store | null> {
  if (!warehouseId) return null;
  const whEsc = String(warehouseId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const stores = await pb.collection(BISNIS_COLLECTIONS.stores).getFullList<Store>({
    filter: `default_warehouse = "${whEsc}" && is_active = true`,
    fields: "name,phone,email,address,email_from_name,email_from_address",
  });
  return stores[0] ?? null;
}

function shareKindFromEmailKind(kind: EmailDocKind): ShareEmailDoc["kind"] {
  if (kind === "quotation") return "quotation";
  if (kind === "purchase_order") return "purchase_order";
  if (kind === "invoice") return "invoice";
  return "sales_order";
}

function buildDocPayload(
  kind: EmailDocKind,
  inv: Invoice | null,
  so: SalesOrder | null,
  po: PurchaseOrder | null,
  store: Store | null,
  baseUrl: string,
): ShareEmailDoc {
  const shareKind = shareKindFromEmailKind(kind);

  if (kind === "invoice" && inv) {
    const paid = (inv.remaining ?? 0) <= 0 || inv.status === "paid";
    return {
      kind: "invoice",
      docNo: inv.invoice_no,
      customerName: inv.expand?.customer?.name ?? "Pelanggan",
      issueOrOrderDate: inv.issue_date,
      dueDate: inv.due_date,
      total: inv.total ?? 0,
      remaining: inv.remaining,
      paid,
      publicUrl: `${baseUrl}${invoiceSharePublicPath(inv.id)}`,
      store,
    };
  }

  if ((kind === "sales_order" || kind === "quotation") && so) {
    const path =
      kind === "quotation"
        ? quotationSharePublicPath(so.id)
        : salesOrderSharePublicPath(so.id);
    return {
      kind: shareKind,
      docNo: so.order_no,
      customerName: so.expand?.customer?.name ?? "Pelanggan",
      issueOrOrderDate: so.order_date,
      total: so.total ?? 0,
      publicUrl: `${baseUrl}${path}`,
      store,
    };
  }

  if (kind === "purchase_order" && po) {
    return {
      kind: "purchase_order",
      docNo: po.po_no,
      customerName: po.expand?.supplier?.name ?? "Supplier",
      issueOrOrderDate: po.order_date,
      dueDate: po.expected_date,
      total: po.total ?? 0,
      publicUrl: `${baseUrl}${purchaseOrderSharePublicPath(po.id)}`,
      store,
    };
  }

  throw new Error("Dokumen tidak ditemukan");
}

function emailSubject(kind: EmailDocKind, docNo: string, store: Store | null): string {
  const prefix = store?.name ? `${store.name} — ` : "";
  switch (kind) {
    case "invoice":
      return `${prefix}Invoice ${docNo}`;
    case "quotation":
      return `${prefix}Penawaran ${docNo}`;
    case "purchase_order":
      return `${prefix}Purchase Order ${docNo}`;
    default:
      return `${prefix}Sales Order ${docNo}`;
  }
}

export async function sendDocumentEmail(
  input: SendDocumentEmailInput,
): Promise<SendDocumentEmailResult> {
  if (!isResendConfigured()) {
    throw new Error(
      "Resend belum dikonfigurasi. Set RESEND_API_KEY dan RESEND_FROM_EMAIL di .env.local.",
    );
  }

  const pb = await getInventoryAdminPb();
  let inv: Invoice | null = null;
  let so: SalesOrder | null = null;
  let po: PurchaseOrder | null = null;
  let warehouseId: string | undefined;

  if (input.kind === "invoice") {
    inv = await pb.collection(BISNIS_COLLECTIONS.invoices).getOne<Invoice>(input.id, {
      expand: "customer,sales_order",
    });
    if (inv.status === "cancelled") throw new Error("Invoice dibatalkan");
    warehouseId = inv.expand?.sales_order?.warehouse;
  } else if (input.kind === "purchase_order") {
    po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(
      input.id,
      { expand: "supplier,warehouse" },
    );
    if (po.status === "cancelled") throw new Error("PO dibatalkan");
    warehouseId = po.warehouse;
  } else {
    so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(input.id, {
      expand: "customer",
    });
    if (so.status === "cancelled") throw new Error("Dokumen dibatalkan");
    warehouseId = so.warehouse;
  }

  const store = await loadStoreForWarehouse(pb, warehouseId);
  const doc = buildDocPayload(input.kind, inv, so, po, store, input.baseUrl);
  const subject = emailSubject(
    input.kind,
    doc.docNo,
    store,
  );
  const sender = resolveEmailSender(store);

  const result = await sendViaResend({
    sender,
    to: input.to,
    subject,
    html: buildShareDocEmailHtml(doc),
    text: buildShareDocEmailText(doc),
  });

  return { ok: true, to: result.to, id: result.id };
}
