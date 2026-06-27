import type { PosSaleMode } from "@/lib/pos/types";

export type PosReceiptLine = {
  name: string;
  sku?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type PosReceiptData = {
  orderNo: string;
  invoiceNo?: string;
  invoiceId?: string;
  salesOrderId?: string;
  mode: PosSaleMode;
  storeName: string;
  warehouseName?: string;
  registerName: string;
  registerCode: string;
  registerAddress?: string;
  cashierName: string;
  cashierPhone?: string;
  buyerName?: string;
  buyerPhone?: string;
  paymentMethodName?: string;
  /** Tunai — tampilkan bayar & kembalian di struk. */
  isCashPayment?: boolean;
  /** WMS — nomor pickup / AWB untuk label paket */
  pickupNo?: string;
  pickupType?: "awb" | "internal";
  dueDate?: string;
  channelName?: string;
  lines: PosReceiptLine[];
  subtotal: number;
  discountAmount: number;
  shippingAmount?: number;
  total: number;
  payAmount: number;
  change: number;
  completedAt: string;
};

const RECEIPT_KEY = "pos_receipt_v1";

export function savePosReceipt(data: PosReceiptData): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(data));
}

export function loadPosReceipt(): PosReceiptData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosReceiptData;
  } catch {
    return null;
  }
}

export function clearPosReceipt(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RECEIPT_KEY);
}
