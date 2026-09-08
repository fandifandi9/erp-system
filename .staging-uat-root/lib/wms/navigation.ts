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
  CheckCircle2,
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
  Calculator,
  Monitor,
  Layers,
  History,
  Link2,
  Settings,
  LineChart,
  Landmark,
  ArrowDownUp,
  UserCircle,
  FileSpreadsheet,
  TrendingUp,
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

/** 📦 Katalog Produk */
export const KATALOG_NAV_ITEMS: NavItem[] = [
  { href: "/katalog", label: "Indeks Katalog", icon: LayoutDashboard, exact: true },
  { href: "/katalog/produk", label: "Produk", icon: Package },
  { href: "/katalog/bundling", label: "Bundling", icon: Boxes },
  { href: "/inventory/categories", label: "Kategori", icon: Tags },
  { href: "/inventory/brands", label: "Brand", icon: Award },
  { href: "/katalog/harga", label: "Harga per Toko", icon: Banknote },
  // Mapping MP & Akun MP disembunyikan dari menu: SKU wajib sama dengan ERP
  // dan akun MP dibuat otomatis saat import. Halaman tetap ada via URL langsung.
  { href: "/wms/barcode", label: "Barcode & Label", icon: Printer },
];

/** 🛒 Penjualan — satu halaman utama + tab (gaya Jurnal) */
export const PENJUALAN_NAV_ITEMS: NavItem[] = [
  { href: "/bisnis/penjualan", label: "Penjualan", icon: ShoppingBag },
  { href: "/bisnis/customer", label: "Pelanggan", icon: Users },
  { href: "/bisnis/kalkulasi-harga-jual", label: "Kalkulasi Harga MP", icon: Calculator },
];

/** 📥 Pembelian — satu halaman utama + tab Tagihan / PO */
export const PEMBELIAN_NAV_ITEMS: NavItem[] = [
  { href: "/bisnis/pembelian", label: "Pembelian", icon: Receipt },
  { href: "/bisnis/supplier", label: "Supplier", icon: Building2 },
];

/** 🏭 Manajemen Gudang */
export const GUDANG_NAV_ITEMS: NavItem[] = [
  { href: "/gudang", label: "Dashboard Gudang", icon: LayoutDashboard, exact: true },
  { href: "/gudang/stok", label: "Inventory", icon: Boxes },
  { href: "/gudang/daftar", label: "Gudang", icon: Warehouse, masterOnly: true },
  { href: "/gudang/penerimaan", label: "Penerimaan Barang", icon: PackageOpen },
  { href: "/gudang/mutasi", label: "Mutasi Stok", icon: ArrowLeftRight },
  { href: "/gudang/opname", label: "Stock Opname", icon: ClipboardCheck },
  { href: "/gudang/qc", label: "QC Barang", icon: ShieldCheck },
  { href: "/gudang/sortir", label: "Sortir & Disposisi", icon: PackageOpen },
  { href: "/gudang/servis-rusak", label: "Servis Gudang Rusak", icon: AlertTriangle },
  { href: "/wms/permintaan-barang/picking", label: "Picking", icon: ShoppingCart },
  { href: "/wms/permintaan-barang/validasi", label: "Packing + QC", icon: ShieldCheck },
  { href: "/wms/permintaan-barang/pickup", label: "Ready To Pickup", icon: PackageCheck },
  { href: "/wms/permintaan-barang/selesai", label: "History", icon: CheckCircle2 },
  { href: "/gudang/transfer", label: "Transfer Gudang", icon: ArrowDownUp },
  { href: "/gudang/zona", label: "Zona & QR", icon: QrCode },
  { href: "/gudang/aktivitas", label: "Aktivitas Gudang", icon: Activity },
  { href: "/gudang/scanner", label: "Monitoring Scanner", icon: ScanLine },
  { href: "/gudang/audit", label: "Audit Gudang", icon: ScrollText, masterOnly: true },
];

/** 🖥️ POS */
export const POS_NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "Kasir POS", icon: Monitor, exact: true },
];

/** 👥 SDM */
export const SDM_NAV_ITEMS: NavItem[] = [
  { href: "/staff", label: "Indeks SDM", icon: LayoutDashboard, exact: true },
  { href: "/staff/karyawan", label: "Karyawan", icon: UserCheck },
  { href: "/staff/absensi", label: "Absensi", icon: Clock },
  { href: "/staff/jadwal", label: "Jadwal", icon: CalendarDays },
  { href: "/staff/cuti", label: "Cuti", icon: CalendarDays },
  { href: "/staff/lembur", label: "Lembur", icon: Clock },
  { href: "/staff/lapangan", label: "Aktivitas Lapangan", icon: Briefcase },
  { href: "/staff/mencurigakan", label: "Aktivitas Mencurigakan", icon: AlertTriangle },
  { href: "/staff/gps", label: "Pengaturan GPS", icon: MapPin },
  { href: "/staff/payroll", label: "Payroll", icon: Banknote },
];

/** 💰 Keuangan */
export const KEUANGAN_NAV_ITEMS: NavItem[] = [
  { href: "/keuangan", label: "Dashboard Keuangan", icon: PieChart, exact: true },
  { href: "/keuangan/kas-bank", label: "Kas & Bank", icon: Landmark },
  { href: "/keuangan/pemasukan", label: "Pemasukan", icon: TrendingUp },
  { href: "/bisnis/biaya", label: "Pengeluaran", icon: Wallet },
  { href: "/keuangan/transfer", label: "Transfer Antar Akun", icon: ArrowLeftRight },
  { href: "/keuangan/hutang", label: "Hutang Supplier", icon: CreditCard },
  { href: "/keuangan/piutang", label: "Piutang Pelanggan", icon: Receipt },
  { href: "/keuangan/rekonsiliasi", label: "Rekonsiliasi", icon: FileCheck },
  { href: "/keuangan/arus-kas", label: "Arus Kas", icon: ArrowDownUp },
  { href: "/bisnis/laba-rugi", label: "Laba Rugi", icon: LineChart },
];

/** 📈 Laporan */
export const LAPORAN_NAV_ITEMS: NavItem[] = [
  { href: "/laporan", label: "Indeks Laporan", icon: LayoutDashboard, exact: true },
  { href: "/bisnis/laporan-penjualan", label: "Penjualan", icon: BarChart3 },
  { href: "/bisnis/laporan-pembelian", label: "Pembelian", icon: Clipboard },
  { href: "/bisnis/laba-rugi", label: "Keuangan", icon: PieChart },
  { href: "/laporan/inventory", label: "Inventory", icon: Boxes },
  { href: "/laporan/gudang", label: "Gudang", icon: Activity },
  { href: "/laporan/marketplace", label: "Marketplace", icon: LineChart },
  { href: "/laporan/sdm", label: "SDM", icon: UserCheck },
];

/** Subset laporan untuk role HR (tanpa modul bisnis penuh). */
export const LAPORAN_NAV_ITEMS_HR: NavItem[] = [
  { href: "/laporan", label: "Indeks Laporan", icon: LayoutDashboard, exact: true },
  { href: "/laporan/sdm", label: "SDM", icon: UserCheck },
];

/** Subset pengaturan untuk role HR. */
export const PENGATURAN_NAV_ITEMS_HR: NavItem[] = [
  { href: "/pengaturan", label: "Indeks Pengaturan", icon: Settings, exact: true },
  { href: "/pengaturan/role", label: "Role & Permission", icon: ShieldCheck },
  { href: "/pengaturan/notifikasi", label: "Notifikasi", icon: AlertTriangle },
];

/** ⚙️ Pengaturan */
export const PENGATURAN_NAV_ITEMS: NavItem[] = [
  { href: "/pengaturan", label: "Indeks Pengaturan", icon: Settings, exact: true },
  { href: "/pengaturan/perusahaan", label: "Perusahaan", icon: Building2 },
  { href: "/pengaturan/akses-entitas", label: "Akses Entitas", icon: ShieldCheck },
  { href: "/bisnis/store", label: "Toko", icon: Store },
  { href: "/bisnis/pos-registers", label: "Master POS", icon: Monitor },
  { href: "/system/register", label: "Pengguna", icon: UserCircle, masterOnly: true },
  { href: "/bisnis/marketplace", label: "Master Marketplace", icon: Layers },
  { href: "/bisnis/ekspedisi", label: "Ekspedisi", icon: Truck },
  { href: "/bisnis/pajak", label: "Pajak / PPN", icon: Percent },
  { href: "/bisnis/term", label: "Jatuh Tempo", icon: CalendarClock },
  { href: "/bisnis/metode-bayar", label: "Metode Pembayaran", icon: CreditCard },
  { href: "/bisnis/penjualan-online/template", label: "Template Fee MP", icon: FileText },
  { href: "/pengaturan/role", label: "Role & Permission", icon: ShieldCheck },
  { href: "/pengaturan/notifikasi", label: "Notifikasi", icon: AlertTriangle },
  { href: "/pengaturan/integrasi", label: "Integrasi", icon: Link2 },
  { href: "/pengaturan/audit-log", label: "Audit Log", icon: ScrollText, masterOnly: true },
];

/** @deprecated — gunakan modul PENJUALAN / PEMBELIAN / PENGATURAN */
export const BISNIS_NAV_MAIN: NavItem[] = [
  ...PENJUALAN_NAV_ITEMS,
  ...PEMBELIAN_NAV_ITEMS.filter((i) => !PENJUALAN_NAV_ITEMS.some((p) => p.href === i.href)),
  ...KEUANGAN_NAV_ITEMS,
  ...LAPORAN_NAV_ITEMS,
];
/** @deprecated — gunakan PENGATURAN_NAV_ITEMS */
export const BISNIS_NAV_REFERENCE: NavItem[] = PENGATURAN_NAV_ITEMS;
/** @deprecated */
export const BISNIS_NAV_ITEMS: NavItem[] = [...BISNIS_NAV_MAIN, ...BISNIS_NAV_REFERENCE];
/** @deprecated — gunakan SDM_NAV_ITEMS */
export const STAFF_NAV_ITEMS: NavItem[] = SDM_NAV_ITEMS;

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function isAnyNavItemActive(pathname: string, items: NavItem[]): boolean {
  return items.some((item) => isNavItemActive(pathname, item));
}

// ── Legacy nav groups (kept for backward compat with existing pages) ──

export const WMS_NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operasi",
    items: [
      { href: "/wms", label: "Dashboard WMS", icon: LayoutDashboard, exact: true },
      { href: "/gudang/penerimaan", label: "Penerimaan", icon: PackageOpen },
      { href: "/gudang/qc", label: "QC", icon: ShieldCheck },
      { href: "/gudang/sortir", label: "Sortir", icon: PackageOpen },
      { href: "/gudang/servis-rusak", label: "Servis Rusak", icon: AlertTriangle },
      {
        href: "/wms/permintaan-barang",
        label: "Permintaan Barang",
        icon: ShoppingCart,
        description: "Picking → Validasi & QC → Ready Pickup → Selesai",
      },
      { href: "/wms/requests", label: "Permintaan gudang", icon: FileStack },
      {
        href: "/wms/barcode",
        label: "Barcode & Label",
        icon: Printer,
        description: "Code128, UPC-A, ITF, QR",
      },
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
      { href: "/inventory/zones", label: "Zona & QR", icon: QrCode, masterOnly: true },
    ],
  },
];

// ── Path helpers ──

function matchesPathPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const KATALOG_PATH_PREFIXES = [
  "/katalog",
  "/inventory/categories",
  "/inventory/brands",
  "/wms/barcode",
] as const;

const PENJUALAN_PATH_PREFIXES = [
  "/penjualan",
  "/bisnis/penjualan",
  "/bisnis/invoice",
  "/bisnis/customer",
  "/bisnis/retur",
  "/bisnis/kalkulasi-harga-jual",
] as const;

const PEMBELIAN_PATH_PREFIXES = [
  "/pembelian",
  "/bisnis/supplier",
  "/bisnis/purchase-order",
  "/bisnis/pembelian",
  "/gudang/penerimaan",
] as const;

const GUDANG_PATH_PREFIXES = [
  "/gudang",
  "/wms",
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

const POS_PATH_PREFIXES = ["/pos"] as const;

const SDM_PATH_PREFIXES = ["/staff", "/hr"] as const;

const KEUANGAN_PATH_PREFIXES = ["/keuangan", "/bisnis/laba-rugi", "/bisnis/biaya"] as const;

const LAPORAN_PATH_PREFIXES = [
  "/laporan",
  "/laporan/sdm",
  "/laporan/inventory",
  "/laporan/gudang",
  "/laporan/marketplace",
  "/bisnis/laporan-penjualan",
  "/bisnis/laporan-pembelian",
  "/bisnis/laba-rugi",
  "/gudang/stok",
  "/gudang/aktivitas",
  "/bisnis/penjualan/riwayat-import",
] as const;

const PENGATURAN_PATH_PREFIXES = [
  "/pengaturan",
  "/pengaturan/perusahaan",
  "/pengaturan/role",
  "/pengaturan/notifikasi",
  "/pengaturan/integrasi",
  "/pengaturan/audit-log",
  "/bisnis/store",
  "/bisnis/pos-registers",
  "/bisnis/ekspedisi",
  "/bisnis/marketplace",
  "/bisnis/pajak",
  "/bisnis/term",
  "/bisnis/metode-bayar",
  "/bisnis/penjualan-online/template",
  "/system",
] as const;

const WMS_PATH_PREFIXES = [...GUDANG_PATH_PREFIXES, ...KATALOG_PATH_PREFIXES] as const;

const ERP_ONLY_PREFIXES = [
  "/inventory",
  "/inventory/products",
  "/inventory/warehouses",
  "/inventory/locations",
  "/inventory/access",
  "/bisnis",
] as const;

const STAFF_PREFIXES = SDM_PATH_PREFIXES;

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

export function isKatalogSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, KATALOG_PATH_PREFIXES);
}

export function isPenjualanSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, PENJUALAN_PATH_PREFIXES);
}

export function isPembelianSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, PEMBELIAN_PATH_PREFIXES);
}

export function isGudangSidebarPath(pathname: string): boolean {
  if (isKatalogSidebarPath(pathname)) return false;
  if (pathname.startsWith("/gudang") || pathname.startsWith("/wms")) return true;
  const invOps = [
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
  return matchesPathPrefix(pathname, invOps);
}

export function isPosSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, POS_PATH_PREFIXES);
}

export function isSdmSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, SDM_PATH_PREFIXES);
}

export function isKeuanganSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, KEUANGAN_PATH_PREFIXES);
}

export function isLaporanSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, LAPORAN_PATH_PREFIXES);
}

export function isPengaturanSidebarPath(pathname: string): boolean {
  return matchesPathPrefix(pathname, PENGATURAN_PATH_PREFIXES);
}

/** @deprecated — gunakan helper modul spesifik */
export function isBisnisSidebarPath(pathname: string): boolean {
  return (
    isPenjualanSidebarPath(pathname) ||
    isPembelianSidebarPath(pathname) ||
    isPosSidebarPath(pathname) ||
    isKeuanganSidebarPath(pathname) ||
    isLaporanSidebarPath(pathname) ||
    isPengaturanSidebarPath(pathname) ||
    pathname === "/bisnis" ||
    pathname.startsWith("/bisnis/")
  );
}

/** @deprecated — gunakan isSdmSidebarPath */
export function isStaffSidebarPath(pathname: string): boolean {
  return isSdmSidebarPath(pathname);
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
  { key: "validate_pack", label: "Validasi & Packing", color: "bg-amber-500" },
  { key: "ready_pickup", label: "Ready To Pickup", color: "bg-cyan-500" },
  { key: "completed", label: "Completed", color: "bg-emerald-500" },
] as const;
