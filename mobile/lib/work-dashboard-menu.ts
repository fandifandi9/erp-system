import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { canAccess, getOperationalDashboardRoute, normalizeAuthModel } from "@/lib/rbac";
import { canAccessHrNativeModule } from "@/lib/hr-native-access";
import { canAccessInventory } from "@/lib/inventory/access";
import { hasOperationalBypass, isOperationalModuleLocked } from "@/lib/operational-access-gate";

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
  accessPath?: string;
};

export type WorkDashboardSections = {
  personal: WorkDashboardTile[];
  workNative: WorkDashboardTile[];
};

export function getNativeHomeHref(user: AuthUser | null | undefined): `/(tabs)/${string}` {
  if (getOperationalDashboardRoute(user)) return "/(tabs)/kerja";
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
  accessPath?: string
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
    accessPath,
  };
}

const PERSONAL_TILES: WorkDashboardTile[] = [];

function getInventoryNativeTiles(user: AuthUser): WorkDashboardTile[] {
  if (!canAccessInventory(user)) return [];
  return [
    nativeTile(
      "inv-hub",
      "Gudang",
      "Zona, scan QR, cek stok",
      "cube",
      "#dbeafe",
      "#1d4ed8",
      "/inventory",
      "/inventory"
    ),
    nativeTile(
      "inv-zone-scan",
      "Scan zona",
      "Check-in QR di gudang",
      "qr-code",
      "#d1fae5",
      "#047857",
      "/inventory/zone-scan",
      "/inventory"
    ),
    nativeTile(
      "inv-product",
      "Cek stok",
      "Scan barcode produk",
      "barcode",
      "#e0e7ff",
      "#4338ca",
      "/inventory/product-scan",
      "/inventory"
    ),
  ];
}

/** Antrean HR di HP — respons ke pengajuan staf. */
function getHrNativeWorkTiles(user: AuthUser): WorkDashboardTile[] {
  if (!canAccessHrNativeModule(user)) return [];
  return [
    nativeTile(
      "hr-leave-queue",
      "Antrean cuti",
      "Setujui / tolak pengajuan cuti",
      "calendar",
      "#fef3c7",
      "#b45309",
      "/hr/leave-queue",
      "/hr"
    ),
    nativeTile(
      "hr-overtime-queue",
      "Lembur",
      "ACC pengajuan & penunjukan lembur",
      "moon",
      "#e0e7ff",
      "#4338ca",
      "/hr/overtime-queue",
      "/hr/overtime"
    ),
    nativeTile(
      "hr-field-queue",
      "Luar kantor",
      "Setujui / tolak aktivitas luar",
      "navigate-circle",
      "#ccfbf1",
      "#0f766e",
      "/hr/field-queue",
      "/hr/field-activity"
    ),
  ];
}

export function getWorkDashboardSections(
  user: AuthUser | null | undefined
): WorkDashboardSections {
  const empty: WorkDashboardSections = { personal: [], workNative: [] };
  if (!user) return empty;

  const personal = PERSONAL_TILES.filter((t) => !t.accessPath || canAccess(user, t.accessPath));

  const inventory = getInventoryNativeTiles(user);

  if (isHrOrOwnerAccount(user)) {
    return { personal, workNative: [...getHrNativeWorkTiles(user), ...inventory] };
  }

  if (inventory.length > 0) {
    return { personal, workNative: inventory };
  }

  return empty;
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
  const auth = normalizeAuthModel(user);
  return auth.accountType === "owner" || auth.roleCode === "hr";
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
    return "Scan QR zona gudang dan cek stok produk dari HP.";
  }
  if (isHrOrOwnerAccount(user)) {
    return "Respons cuti, lembur, dan luar kantor dari staf — pengaturan lengkap di laptop.";
  }
  if (hasOperationalBypass(user)) {
    return "Akses operasional tidak dibatasi check-in untuk peran Anda.";
  }
  if (isOperationalModuleLocked(user)) {
    return "Check-in dulu di tab Absensi untuk membuka meja kerja. Check-out menutup lagi.";
  }
  const auth = normalizeAuthModel(user);
  if (auth.dashboardAccess) {
    return "Sesi aktif — gunakan dashboard operasional di laptop untuk modul lengkap.";
  }
  return "Sesi operasional aktif setelah check-in. Cuti & lembur tetap di tab Absensi.";
}

export function getWorkSectionHint(user: AuthUser | null | undefined): string {
  if (isHrOrOwnerAccount(user)) {
    return "Antrean native — tidak perlu browser.";
  }
  return "Terbuka setelah check-in di tab Absensi.";
}

export function getPersonalSectionHint(): string {
  return "Cuti, lembur, luar kantor: tab Absensi · slip gaji: tab Profil.";
}
