"use client";

import { CancelInvoiceModal } from "@/components/bisnis/CancelInvoiceModal";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  billNo: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function CancelPurchaseModal({ billNo, open, onClose, onConfirm }: Props) {
  const { t } = useLocale();
  return (
    <CancelInvoiceModal
      invoiceNo={billNo}
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("purchase.cancel.title")}
      description={t("purchase.cancel.description", { billNo })}
      confirmLabel={t("purchase.cancel.confirm")}
    />
  );
}
