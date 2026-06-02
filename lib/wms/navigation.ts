import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PackageOpen,
  ShieldCheck,
  MapPinned,
  ShoppingCart,
  PackageCheck,
  FileStack,
  ClipboardCheck,
  ScrollText,
  Activity,
  QrCode,
  Boxes,
  ArrowLeftRight,
  ScanLine,
  Printer,
  Package,
  Tags,
  Award,
  Warehouse,
  Receipt,
  ShoppingBag,
  Truck,
  Users,
  Building2,
  BarChart3,
  FileText,
  RotateCcw,
  Clipboard,
  UserCheck,
  Clock,
  CalendarDays,
  MapPin,
  Banknote,
  AlertTriangle,
  Briefcase,
  Wallet,
  PieChart,
  Store,
  Percent,
  CalendarClock,
  FileCheck,
  CreditCard,
  Globe,
  Calculator,
} from "lucide-react";

export type InventoryModule = "erp" | "wms";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  masterOnly?: boolean;
  description?: string;
};

/** Manajemen Gudang (WMS) — operasional gudang saja, tanpa master produk / keuangan */
export const GUDANG_NAV_ITEMS: NavItem[] = [
  { href: "/gudang", label: "Dashboard Gudang", icon: LayoutDashboard, exact: true },
  {
    href: "/gudang/produk",
    label: "Daftar Produk",
    icon: Package,
    description: "Cari produk & penempatan rak",
  },
  { href: "/gudang/penerimaan", label: "Penerimaan Barang", icon: PackageOpen },
  { href: "/gudang/qc", label: "QC Barang", icon: ShieldCheck },
  { href: "/gudang/putaway", label: "Putaway", icon: MapPinned },
  { href: "/gudang/lokasi", label: "Lokasi Ruangan", icon: MapPinned, description: "Ruangan per gudang" },
  { href: "/gudang/zona", label: "Zona & QR", icon: QrCode, description: "Area QC, penerimaan, kemasan" },
  { href: "/gudang/picking", label: "Picking (keluar)", icon: ShoppingCart },
  { href: "/gudang/validasi", label: "Validasi", icon: ShieldCheck },
  { href: "/gudang/packing", label: "Packing", icon: PackageCheck },
  { href: "/gudang/pickup", label: "Ready Pickup", icon: Truck },
  { href: "/gudang/transfer", label: "Transfer Gudang", icon: ArrowLeftRight },
  { href: "/gudang/opname", label: "Stock Opname", icon: ClipboardCheck },
  { href: "/gudang/audit", label: "Audit Gudang", icon: ScrollText, masterOnly: true },
  { href: "/gudang/aktivitas", label: "Aktivitas Gudang", icon: Activity },
  { href: "/gudang/scanner", label: "Monitoring Scanner", icon: ScanLine },
  {
    href: "/gudang/barcode",
    label: "Barcode & Label",
    icon: Printer,
    description: "Code128 + QR, printer termal",
  },
  { href: "/gudang/daftar", label: "Daftar Gudang", icon: Warehouse, masterOnly: true },
];

/** Manajemen Bisnis — menu harian */
export const BISNIS_NAV_MAIN: NavItem[] = [
  { href: "/bisnis", label: "Dashboard Bisnis", icon: LayoutDashboard, exact: true },
  { href: "/bisnis/store", label: "Toko", icon: Store, description: "Multi-toko, gudang default, rekening bank" },
  { href: "/bisnis/penjualan", label: "Penjualan", icon: ShoppingBag },
  { href: "/bisnis/penjualan-online", label: "Penjualan Online", icon: Globe, description: "Import MP massal + biaya otomatis" },
  { href: "/bisnis/kalkulasi-harga-jual", label: "Kalkulasi Harga Jual", icon: Calculator, description: "Rekomendasi harga jual marketplace per tier" },
  { href: "/bisnis/pembelian", label: "Pembelian", icon: Receipt },
  { href: "/bisnis/biaya", label: "Biaya", icon: Wallet },
  { href: "/bisnis/customer", label: "Kontak", icon: Users },
  { href: "/bisnis/supplier", label: "Supplier", icon: Building2 },
  { href: "/bisnis/produk", label: "Produk", icon: Package },
  { href: "/bisnis/retur", label: "Retur", icon: RotateCcw },
  { href: "/bisnis/laba-rugi", label: "Laba Rugi", icon: PieChart },
  { href: "/bisnis/laporan-penjualan", label: "Laporan Penjualan", icon: BarChart3 },
  { href: "/bisnis/laporan-pembelian", label: "Laporan Pembelian", icon: Clipboard },
];

/** Master & pembayaran — jarang diubah, dikelompokkan di sidebar */
export const BISNIS_NAV_REFERENCE: NavItem[] = [
  { href: "/bisnis/kategori", label: "Kategori", icon: Tags, masterOnly: true },
  { href: "/bisnis/brand", label: "Brand", icon: Award, masterOnly: true },
  { href: "/bisnis/pajak", label: "Pajak / PPN", icon: Percent, description: "Kelola tarif pajak" },
  { href: "/bisnis/term", label: "Term Pembayaran", icon: CalendarClock, description: "Jangka waktu bayar" },
  { href: "/bisnis/syarat-bayar", label: "Syarat Pembayaran", icon: FileCheck, description: "Kondisi pembayaran" },
  { href: "/bisnis/metode-bayar", label: "Metode Pembayaran", icon: CreditCard, description: "Transfer, tunai, dll" },
];

/** @deprecated gunakan BISNIS_NAV_MAIN + BISNIS_NAV_REFERENCE */
export const BISNIS_NAV_ITEMS: NavItem[] = [...BISNIS_NAV_MAIN, ...BISNIS_NAV_REFERENCE];

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function isAnyNavItemActive(pathname: string, items: NavItem[]): boolean {
  return items.some((item) => isNavItemActive(pathname, item));
}

/** Manajemen Staff */
export const STAFF_NAV_ITEMS: NavItem[] = [
  { href: "/staff", label: "Dashboard Staff", icon: LayoutDashboard, exact: true },
  { href: "/staff/karyawan", label: "Data Karyawan", icon: UserCheck },
  { href: "/staff/absensi", label: "Monitoring Absensi", icon: Clock },
  { href: "/staff/mencurigakan", label: "Aktivitas Mencurigakan", icon: AlertTriangle },
  { href: "/staff/cuti", label: "Permohonan Cuti", icon: CalendarDays },
  { href: "/staff/lembur", label: "Lembur", icon: Clock },
  { href: "/staff/jadwal", label: "Jadwal Kerja", icon: CalendarDays },
  { href: "/staff/lapangan", label: "Aktivitas Lapangan", icon: Briefcase },
  { href: "/staff/gps", label: "Pengaturan GPS", icon: MapPin },
  { href: "/staff/payroll", label: "Payroll", icon: Banknote },
];

// ── Legacy nav groups (kept for backward compat with existing pages) ──

export const WMS_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operasi",
    items: [
      { href: "/wms", label: "Dashboard WMS", icon: LayoutDashboard, exact: true },
      { href: "/wms/receiving", label: "Penerimaan", icon: PackageOpen },
      { href: "/wms/qc", label: "QC", icon: ShieldCheck },
      { href: "/wms/putaway", label: "Putaway", icon: MapPinned },
      { href: "/wms/picking", label: "Picking", icon: ShoppingCart },
      { href: "/wms/packing", label: "Kemasan", icon: PackageCheck },
      { href: "/wms/requests", label: "Permintaan gudang", icon: FileStack },
    ],
  },
  {
    title: "Kontrol",
    items: [
      { href: "/wms/opname", label: "Opname stok", icon: ClipboardCheck },
      { href: "/wms/audit", label: "Log audit", icon: ScrollText, masterOnly: true },
      { href: "/wms/activity", label: "Aktivitas gudang", icon: Activity },
      { href: "/wms/checkin", label: "Masuk zona", icon: QrCode },
    ],
  },
];

export const ERP_INVENTORY_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "ERP Core",
    items: [
      { href: "/inventory", label: "Ringkasan", icon: LayoutDashboard, exact: true },
      { href: "/inventory/stock", label: "Stok", icon: Boxes },
      { href: "/inventory/movements", label: "Mutasi stok", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Master Data",
    items: [
      { href: "/inventory/products", label: "Produk", icon: Package },
      { href: "/inventory/categories", label: "Kategori", icon: Tags, masterOnly: true },
      { href: "/inventory/brands", label: "Merek", icon: Award, masterOnly: true },
      { href: "/inventory/warehouses", label: "Gudang", icon: Warehouse, masterOnly: true },
      { href: "/inventory/locations", label: "Lokasi rak", icon: MapPinned, masterOnly: true },
      { href: "/inventory/zones", label: "Zona & QR", icon: QrCode, masterOnly: true },
    ],
  },
];

// ── Path helpers ──

const WMS_PATH_PREFIXES = [
  "/wms",
  "/gudang",
  "/gudang/transfer",
  "/gudang/scanner",
  "/gudang/label",
  "/inventory/stock",
  "/inventory/movements",
  "/inventory/zones",
  "/inventory/activities",
  "/inventory/packing",
  "/inventory/opname",
  "/inventory/audit",
  "/inventory/media",
  "/inventory/cctv",
] as const;

const ERP_ONLY_PREFIXES = [
  "/inventory",
  "/inventory/products",
  "/inventory/categories",
  "/inventory/brands",
  "/inventory/warehouses",
  "/inventory/locations",
  "/inventory/access",
  "/bisnis",
] as const;

const STAFF_PREFIXES = ["/staff", "/hr"] as const;

export function resolveInventoryModule(pathname: string): InventoryModule {
  if (pathname === "/inventory" || pathname === "/inventory/") return "erp";
  for (const p of ERP_ONLY_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return "erp";
  }
  for (const p of WMS_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return "wms";
  }
  if (pathname.startsWith("/inventory")) return "erp";
  return "wms";
}

export function flattenNavGroups(groups: { title: string; items: NavItem[] }[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}

export function isGudangSidebarPath(pathname: string): boolean {
  if (pathname.startsWith("/gudang")) return true;
  if (pathname.startsWith("/wms")) return true;
  return resolveInventoryModule(pathname) === "wms";
}

export function isBisnisSidebarPath(pathname: string): boolean {
  if (pathname.startsWith("/bisnis")) return true;
  if (!pathname.startsWith("/inventory")) return false;
  return resolveInventoryModule(pathname) === "erp";
}

export function isStaffSidebarPath(pathname: string): boolean {
  return STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** @deprecated use isGudangSidebarPath */
export function isWmsSidebarPath(pathname: string): boolean {
  return isGudangSidebarPath(pathname);
}

/** @deprecated use isBisnisSidebarPath */
export function isErpSidebarPath(pathname: string): boolean {
  return isBisnisSidebarPath(pathname);
}

/** @deprecated */
export function isInventorySidebarPath(pathname: string): boolean {
  return isGudangSidebarPath(pathname) || isBisnisSidebarPath(pathname);
}

export const WMS_FLOW_STEPS = [
  { key: "purchase", label: "Purchase", color: "bg-slate-500" },
  { key: "receiving", label: "Penerimaan", color: "bg-emerald-500" },
  { key: "qc", label: "QC", color: "bg-amber-500" },
  { key: "putaway", label: "Putaway", color: "bg-indigo-500" },
  { key: "stock", label: "Stok tersedia", color: "bg-cyan-500" },
] as const;

export const WMS_OUTBOUND_FLOW = [
  { key: "sales", label: "Sales order", color: "bg-slate-500" },
  { key: "picking", label: "Picking", color: "bg-violet-500" },
  { key: "packing", label: "Kemasan", color: "bg-pink-500" },
  { key: "shipping", label: "Pengiriman", color: "bg-orange-500" },
  { key: "out", label: "Stok keluar", color: "bg-red-500" },
] as const;

export const WMS_OUTBOUND_FLOW_STEPS = [
  { key: "picking", label: "Picking", color: "bg-violet-500" },
  { key: "validasi", label: "Validasi", color: "bg-amber-500" },
  { key: "packing", label: "Packing", color: "bg-pink-500" },
  { key: "pickup", label: "Pickup", color: "bg-emerald-500" },
] as const;
