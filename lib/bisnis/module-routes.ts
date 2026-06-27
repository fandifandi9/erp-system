/** Tab routes — penjualan & pembelian (gaya Jurnal). */
export const SALES_MODULE = {
  penagihan: "/bisnis/penjualan",
  pesanan: "/bisnis/penjualan/pesanan",
  buat: "/bisnis/penjualan/buat",
} as const;

export const PURCHASE_MODULE = {
  tagihan: "/bisnis/pembelian",
  pesanan: "/bisnis/pembelian/pesanan",
  buat: "/bisnis/pembelian/buat",
} as const;

export function salesCreateUrl(type: "so" | "invoice") {
  return `${SALES_MODULE.buat}?type=${type}`;
}

export function purchaseCreateUrl(type: "po" | "bill") {
  return `${PURCHASE_MODULE.buat}?type=${type}`;
}

/** Tampilkan header + tab modul hanya di daftar (bukan form buat/edit/detail). */
export function isSalesModuleChromePath(pathname: string): boolean {
  if (pathname === SALES_MODULE.penagihan || pathname === SALES_MODULE.pesanan) return true;
  if (pathname === "/bisnis/invoice") return true;
  return false;
}

export function isPurchaseModuleChromePath(pathname: string): boolean {
  if (pathname === PURCHASE_MODULE.tagihan || pathname === PURCHASE_MODULE.pesanan) return true;
  if (pathname === "/bisnis/purchase-order") return true;
  return false;
}

export function isSalesPenagihanPath(pathname: string): boolean {
  return pathname === SALES_MODULE.penagihan || pathname === "/bisnis/invoice";
}

export function isSalesPesananPath(pathname: string): boolean {
  return pathname === SALES_MODULE.pesanan || pathname.startsWith(`${SALES_MODULE.pesanan}/`);
}

export function isPurchaseTagihanPath(pathname: string): boolean {
  return pathname === PURCHASE_MODULE.tagihan;
}

export function isPurchasePesananPath(pathname: string): boolean {
  return (
    pathname === PURCHASE_MODULE.pesanan ||
    pathname.startsWith(`${PURCHASE_MODULE.pesanan}/`) ||
    pathname === "/bisnis/purchase-order"
  );
}
