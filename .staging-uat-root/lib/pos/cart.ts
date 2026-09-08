import type { PosCart, PosCartLine } from "@/lib/pos/types";

export function calcCartSubtotal(cart: PosCart): number {
  return cart.lines.reduce((s, l) => s + l.lineTotal, 0);
}

/** Total pesanan — ongkir diisi di halaman pengiriman (opsional). */
export function calcCartTotal(cart: PosCart, shippingAmount = 0): number {
  const sub = calcCartSubtotal(cart);
  const disc = Math.min(cart.discountAmount || 0, sub);
  const ship = Math.max(0, shippingAmount);
  return Math.max(0, sub - disc + ship);
}

export function newCartLineKey(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function recalcLine(line: PosCartLine): PosCartLine {
  const qty = Math.max(0, line.qty);
  const unitPrice = Math.max(0, line.unitPrice);
  return { ...line, qty, unitPrice, lineTotal: qty * unitPrice };
}
