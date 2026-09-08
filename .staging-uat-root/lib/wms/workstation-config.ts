import type { WmsWorkstation } from "./workstations";

/**
 * Konfigurasi operasional meja validator.
 *
 * UJI COBA — kunci semua meja:
 *   Set `WMS_DESK_CHECKIN_ENABLED = false` lalu simpan.
 *   Staff tidak bisa check-in sampai Anda ubah ke `true`.
 *
 * Kunci per meja saja:
 *   Isi `WMS_LOCKED_DESK_CODES` mis. ["VALIDATOR-02", "VALIDATOR-03"]
 *
 * Override via .env (tanpa ubah file):
 *   WMS_DESK_CHECKIN_OPEN=false
 *   WMS_LOCKED_DESKS=VALIDATOR-02,VALIDATOR-03
 */

/** false = semua check-in meja ditolak (mode uji / belum go-live) */
export const WMS_DESK_CHECKIN_ENABLED = true;

/** Kode meja yang masih dikunci (huruf besar, contoh VALIDATOR-01) */
export const WMS_LOCKED_DESK_CODES: string[] = [];

const LOCKED_ENV =
  process.env.WMS_LOCKED_DESKS ??
  process.env.NEXT_PUBLIC_WMS_LOCKED_DESKS ??
  "";

function envCheckInEnabled(): boolean | null {
  const v =
    process.env.WMS_DESK_CHECKIN_OPEN ??
    process.env.NEXT_PUBLIC_WMS_DESK_CHECKIN_OPEN;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

export function isDeskCheckInGloballyEnabled(): boolean {
  const fromEnv = envCheckInEnabled();
  if (fromEnv !== null) return fromEnv;
  return WMS_DESK_CHECKIN_ENABLED;
}

export function getLockedDeskCodeSet(): Set<string> {
  const fromEnv = LOCKED_ENV.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const fromFile = WMS_LOCKED_DESK_CODES.map((c) => c.trim().toUpperCase());
  return new Set([...fromFile, ...fromEnv]);
}

export function isDeskCodeLocked(code: string): boolean {
  return getLockedDeskCodeSet().has(code.trim().toUpperCase());
}

export function assertWorkstationAvailableForCheckIn(ws: WmsWorkstation): void {
  if (!isDeskCheckInGloballyEnabled()) {
    throw new Error(
      "Check-in meja sementara dinonaktifkan (mode uji coba). Aktifkan di lib/wms/workstation-config.ts atau set WMS_DESK_CHECKIN_OPEN=true.",
    );
  }
  if (ws.is_active === false) {
    throw new Error(`Meja ${ws.code} tidak aktif di master data.`);
  }
  if (isDeskCodeLocked(ws.code)) {
    throw new Error(
      `Meja ${ws.code} masih dikunci. Hapus dari WMS_LOCKED_DESK_CODES atau env WMS_LOCKED_DESKS sebelum dipakai.`,
    );
  }
}

export function getWorkstationConfigSummary() {
  return {
    checkInEnabled: isDeskCheckInGloballyEnabled(),
    lockedCodes: [...getLockedDeskCodeSet()],
  };
}
