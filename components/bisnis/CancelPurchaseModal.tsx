"use client";

import { CancelInvoiceModal } from "@/components/bisnis/CancelInvoiceModal";

type Props = {
  billNo: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

export function CancelPurchaseModal({ billNo, open, onClose, onConfirm }: Props) {
  return (
    <CancelInvoiceModal
      invoiceNo={billNo}
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Batalkan pembelian"
      description={
        <>
          Tagihan <span className="font-mono font-medium">{billNo}</span> akan dibatalkan.
          Stok yang sudah masuk akan dikurangi kembali. Data tetap bisa dilihat tetapi tidak bisa diedit.
        </>
      }
      confirmLabel="Batalkan pembelian"
    />
  );
}
