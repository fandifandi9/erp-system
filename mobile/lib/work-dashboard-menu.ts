import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { hasCapability } from "@/lib/capabilities";
import { canAccessInventory } from "@/lib/inventory/access";
import { hasOperationalBypass, isOperationalModuleLocked } from "@/lib/operational-access-gate";
import { normalizeAuthModel } from "@/lib/rbac";
import type { MobileCapability } from "@/lib/capabilities";

type AuthUser = Record<string, unknown>;

type IonName = ComponentProps<typeof Ionicons>["name"];

export type WorkDashboardTileGroup = "personal" | "work-native";

export type WorkDashboardTile = {
  id: string;
  title: string;
  subtitle: string;
  icon: IonName;
  iconBg: string;
  iconColor: string;
  group: WorkDashboardTileGroup;
  nativeHref: string;
  /** Capability required to show tile (Phase 31). */
  requiredCapability?: MobileCapability;
  /** Phase NEXT — pending count from scoped desk summary API */
  badgeCount?: number;
};

export type WorkDashboardSections = {
  personal: WorkDashboardTile[];
  workNative: WorkDashboardTile[];
};

export function getNativeHomeHref(user: AuthUser | null | undefined): `/(tabs)/${string}` {
  if (user && hasCapability(user, "dashboard.operational")) return "/(tabs)/kerja";
  return "/(tabs)/attendance";
}

function nativeTile(
  id: string,
  title: string,
  subtitle: string,
  icon: IonName,
  iconBg: string,
  iconColor: string,
  nativeHref: string,
  requiredCapability?: MobileCapability
): WorkDashboardTile {
  return {
    id,
    title,
    subtitle,
    icon,
    iconBg,
    iconColor,
    nativeHref,
    group: "work-native",
    requiredCapability,
  };
}

/**
 * Phase 35I-L — Meja Kerja is action center only.
 * Personal activity (profil/absensi/cuti/lembur) lives in Absensi/Profil tabs — not here.
 * Reports/notifications are not Meja Kerja tiles.
 */
const PERSONAL_TILES: WorkDashboardTile[] = [];

/** Field / scan actions only — not a mini warehouse ERP catalog. */
function getInventoryNativeTiles(user: AuthUser): WorkDashboardTile[] {
  if (!canAccessInventory(user)) return [];
  return [
    nativeTile(
      "inv-zone-scan",
      "Scan zona",
      "Masuk zona QR di gudang",
      "qr-code",
      "#d1fae5",
      "#047857",
      "/inventory/zone-scan",
      "inventory.zone_scan"
    ),
    nativeTile(
      "inv-product",
      "Scan produk",
      "Barcode → produk / lokasi / qty",
      "barcode",
      "#fef3c7",
      "#000000",
      "/inventory/product-scan",
      "inventory.product_scan"
    ),
    nativeTile(
      "inv-opname",
      "Validasi opname",
      "Hitung fisik di lapangan",
      "clipboard",
      "#fef3c7",
      "#b45309",
      "/inventory/opname",
      "inventory.opname"
    ),
  ];
}

function getWmsNativeTiles(user: AuthUser): WorkDashboardTile[] {
  if (!canAccessInventory(user)) return [];
  return [
    nativeTile(
      "wms-ws-scan",
      "Scan meja validasi",
      "QR meja · CCTV",
      "desktop",
      "#cffafe",
      "#0e7490",
      "/wms/workstation-scan",
      "wms.workstation_scan"
    ),
  ];
}

/** Antrean HR di HP — respons ke pengajuan staf. */
function getHrNativeWorkTiles(user: AuthUser): WorkDashboardTile[] {
  const tiles: WorkDashboardTile[] = [
    nativeTile(
      "hr-leave-queue",
      "Antrean cuti",
      "Setujui / tolak pengajuan cuti",
      "calendar",
      "#fef3c7",
      "#b45309",
      "/hr/leave-queue",
      "hr.queue.leave"
    ),
    nativeTile(
      "hr-overtime-queue",
      "Lembur",
      "ACC pengajuan & penunjukan lembur",
      "moon",
      "#fef3c7",
      "#000000",
      "/hr/overtime-queue",
      "hr.queue.overtime"
    ),
    nativeTile(
      "hr-field-queue",
      "Luar kantor",
      "Setujui / tolak aktivitas luar",
      "navigate-circle",
      "#ccfbf1",
      "#0f766e",
      "/hr/field-queue",
      "hr.queue.field_activity"
    ),
    nativeTile(
      "hr-recruitment-queue",
      "Approval rekrutmen",
      "Setujui / tolak permintaan rekrutmen",
      "person-add",
      "#e0e7ff",
      "#3730a3",
      "/hr/recruitment-queue",
      "hr.queue.leave"
    ),
    nativeTile(
      "hr-findings",
      "Temuan HR",
      "Catat temuan + bukti foto",
      "alert-circle-outline",
      "#fee2e2",
      "#991b1b",
      "/findings",
      "finding.view"
    ),
  ];
  return tiles.filter(
    (t) => !t.requiredCapability || hasCapability(user, t.requiredCapability),
  );
}

function filterTilesByCapability(user: AuthUser, tiles: WorkDashboardTile[]): WorkDashboardTile[] {
  return tiles.filter(
    (t) => !t.requiredCapability || hasCapability(user, t.requiredCapability),
  );
}

export function getWorkDashboardSections(
  user: AuthUser | null | undefined
): WorkDashboardSections {
  const empty: WorkDashboardSections = { personal: [], workNative: [] };
  if (!user) return empty;

  const personal = filterTilesByCapability(user, PERSONAL_TILES);

  const inventory = filterTilesByCapability(user, getInventoryNativeTiles(user));
  const wms = filterTilesByCapability(user, getWmsNativeTiles(user));
  const hrTiles = getHrNativeWorkTiles(user);
  const ops = [...wms, ...inventory, ...hrTiles];

  if (ops.length > 0) {
    return { personal, workNative: ops };
  }

  return { personal, workNative: [] };
}

export function getWorkDashboardTiles(user: AuthUser | null | undefined): WorkDashboardTile[] {
  const s = getWorkDashboardSections(user);
  return [...s.personal, ...s.workNative];
}

export function hasOperationalWorkModules(user: AuthUser | null | undefined): boolean {
  return getWorkDashboardSections(user).workNative.length > 0;
}

export function isHrOrOwnerAccount(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return hasCapability(user, "hr.queue.leave") || hasCapability(user, "leave.approve");
}

/** Semua pengguna login melihat tab Meja kerja (konten mengikuti check-in/out). */
export function shouldShowMejaKerjaTab(user: AuthUser | null | undefined): boolean {
  return !!user;
}

/** @deprecated gunakan shouldShowMejaKerjaTab */
export const shouldShowKerjaTab = shouldShowMejaKerjaTab;

export function shouldShowOperationalWorkSection(user: AuthUser | null | undefined): boolean {
  return !!user;
}

export function getAccountRoleLabel(user: AuthUser | null | undefined): string {
  if (!user) return "—";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "Owner";
  if (auth.roleCode === "hr") return "HR";
  if (auth.roleCode) return auth.roleCode;
  return "Staf";
}

export function isOperationalWorkSectionLocked(
  user: AuthUser | null | undefined
): boolean {
  return isOperationalModuleLocked(user);
}

export function getWorkDashboardTitle(user: AuthUser | null | undefined): string {
  if (isHrOrOwnerAccount(user)) return "Antrean HR";
  return "Meja kerja";
}

export function getWorkDashboardSubtitle(user: AuthUser | null | undefined): string {
  if (canAccessInventory(user) && !isHrOrOwnerAccount(user)) {
    return "Action center lapangan: scan zona/produk dan validasi — bukan mini ERP.";
  }
  if (isHrOrOwnerAccount(user)) {
    return "Approval cepat (cuti/lembur/luar kantor). Workspace HR penuh ada di Desktop.";
  }
  if (hasOperationalBypass(user)) {
    return "Akses operasional tidak dibatasi absen masuk untuk peran Anda.";
  }
  if (isOperationalModuleLocked(user)) {
    return "Absen masuk dulu di tab Absensi untuk membuka meja kerja. Absen pulang menutup lagi.";
  }
  const auth = normalizeAuthModel(user);
  if (auth.dashboardAccess) {
    return "Action center saja. Profil, absensi, cuti, lembur ada di tab Absensi/Profil. ERP penuh di Desktop.";
  }
  return "Sesi operasional aktif setelah absen masuk. Aktivitas personal tetap di tab Absensi.";
}

export function getWorkSectionHint(user: AuthUser | null | undefined): string {
  if (isHrOrOwnerAccount(user)) {
    return "Approval / antrean — otorisasi sama dengan Desktop.";
  }
  return "Tindakan lapangan — terbuka setelah absen masuk.";
}

export function getPersonalSectionHint(): string {
  return "Aktivitas personal tidak di Meja Kerja: Absensi · Cuti · Lembur · Profil.";
}
