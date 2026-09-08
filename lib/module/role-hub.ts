import { isHrAccount, type AuthUserShape } from "@/lib/rbac";
import {
  LAPORAN_NAV_ITEMS,
  LAPORAN_NAV_ITEMS_HR,
  PENGATURAN_NAV_ITEMS,
  PENGATURAN_NAV_ITEMS_HR,
  type NavItem,
} from "@/lib/wms/navigation";

/** Indeks laporan: HR hanya SDM; Owner/operasional tetap katalog penuh. */
export function selectLaporanNavItems(user: AuthUserShape | null | undefined): NavItem[] {
  if (!user) return [];
  return isHrAccount(user) ? LAPORAN_NAV_ITEMS_HR : LAPORAN_NAV_ITEMS;
}

/** Indeks pengaturan: HR hanya peran + notifikasi. */
export function selectPengaturanNavItems(user: AuthUserShape | null | undefined): NavItem[] {
  if (!user) return [];
  return isHrAccount(user) ? PENGATURAN_NAV_ITEMS_HR : PENGATURAN_NAV_ITEMS;
}

export function showOwnerPengaturanExtras(user: AuthUserShape | null | undefined): boolean {
  return Boolean(user) && !isHrAccount(user);
}

export function showLaporanImportMp(user: AuthUserShape | null | undefined): boolean {
  return Boolean(user) && !isHrAccount(user);
}
