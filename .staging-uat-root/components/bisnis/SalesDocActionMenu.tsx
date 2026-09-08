"use client";

import { DocumentShareMenu } from "@/components/bisnis/DocumentShareMenu";
import { useLocale } from "@/components/LocaleProvider";
import {
  invoiceSharePayload,
  salesOrderSharePayload,
  quotationSharePayload,
} from "@/lib/bisnis/doc-share";
import { getSalesOrderDocStatus } from "@/lib/bisnis/client";
import type { Invoice, SalesOrder, Store } from "@/lib/bisnis/types";

type InvoiceShareMenuProps = {
  invoice: Invoice;
  store?: Store | null;
  iconOnly?: boolean;
};

export function InvoiceShareMenu({ invoice, store, iconOnly }: InvoiceShareMenuProps) {
  const { t } = useLocale();
  if (invoice.status === "cancelled") return null;
  const share = invoiceSharePayload(invoice, store ?? null);
  return <DocumentShareMenu share={share} linkLabel={t("share.invoiceLink")} iconOnly={iconOnly} />;
}

export const InvoiceActionMenu = InvoiceShareMenu;

type SalesOrderShareMenuProps = {
  order: SalesOrder;
  store?: Store | null;
};

export function SalesOrderShareMenu({ order, store }: SalesOrderShareMenuProps) {
  const { t } = useLocale();
  if (getSalesOrderDocStatus(order) === "cancelled") return null;
  const share = salesOrderSharePayload(order, store ?? null);
  return <DocumentShareMenu share={share} linkLabel={t("share.soLink")} />;
}

/** Penawaran — SO yang masih draf (belum dikonfirmasi gudang). */
export function QuotationShareMenu({ order, store }: SalesOrderShareMenuProps) {
  const { t } = useLocale();
  if (getSalesOrderDocStatus(order) === "cancelled") return null;
  const share = quotationSharePayload(order, store ?? null);
  return <DocumentShareMenu share={share} linkLabel={t("share.quotationLink")} />;
}

export function SalesOrderActionMenu({
  order,
  store,
}: SalesOrderShareMenuProps & { editable?: boolean; cancelled?: boolean }) {
  const doc = getSalesOrderDocStatus(order);
  if (doc === "draft") {
    return <QuotationShareMenu order={order} store={store} />;
  }
  return <SalesOrderShareMenu order={order} store={store} />;
}
