"use client";

import { DocumentShareMenu } from "@/components/bisnis/DocumentShareMenu";
import { purchaseOrderSharePayload } from "@/lib/bisnis/doc-share";
import { getPurchaseOrderDocStatus } from "@/lib/bisnis/client";
import type { PurchaseOrder, Store } from "@/lib/bisnis/types";
import { useLocale } from "@/components/LocaleProvider";

export function PurchaseOrderShareMenu({
  po,
  store,
}: {
  po: PurchaseOrder;
  store?: Store | null;
}) {
  const { t } = useLocale();
  if (getPurchaseOrderDocStatus(po) === "cancelled") return null;
  const share = purchaseOrderSharePayload(po, store ?? null);
  return <DocumentShareMenu share={share} linkLabel={t("share.poLink")} />;
}
