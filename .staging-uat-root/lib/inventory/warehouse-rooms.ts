import type { InvLocation } from "./types";
import { parseLayoutFromName } from "./rack-layout";
import { slugCodePart } from "./location-codes";

export type RoomLoc = Pick<InvLocation, "code" | "name" | "zone_type" | "level" | "bin" | "aisle">;

/** Prefix kode ruangan tanpa strip di tengah (WH-009 → WH009). */
export function compactWarehouseCodePrefix(warehouseCode: string): string {
  return slugCodePart(warehouseCode.replace(/-/g, " "), 10);
}

/** Ambil bagian kode setelah prefix gudang (WH-009-R01 → R01). */
export function stripWarehouseCodePrefix(locationCode: string, warehouseCode: string): string {
  const c = locationCode.trim().toUpperCase();
  const wh = warehouseCode.trim().toUpperCase();
  const compact = compactWarehouseCodePrefix(warehouseCode);
  for (const prefix of [wh, compact]) {
    if (!prefix) continue;
    if (c === prefix) return "";
    const withDash = `${prefix}-`;
    if (c.startsWith(withDash)) return c.slice(withDash.length);
  }
  return c;
}

/** Rak induk punya suffix [layout:tingkat:…|slot:…] di nama. */
export function isRackMaster(loc: RoomLoc): boolean {
  return !!parseLayoutFromName(loc.name ?? "");
}

function isRackSlotFields(loc: RoomLoc): boolean {
  return !!(loc.level ?? "").trim() && !!(loc.bin ?? "").trim();
}

/**
 * Ruangan gudang (penempatan produk / picking / putaway).
 * Jika `warehouseCode` diberikan, kode seperti WH-009-R01 dianggap ruangan (suffix 1 segmen).
 */
export function isWarehouseRoom(loc: RoomLoc, warehouseCode?: string): boolean {
  const code = (loc.code ?? "").trim();
  if (!code) return false;
  if (parseLayoutFromName(loc.name ?? "")) return false;
  if (isRackSlotFields(loc)) return false;

  const zt = (loc.zone_type ?? "").toLowerCase();
  if (zt === "room" || zt === "storage") return true;

  const wh = warehouseCode?.trim();
  if (wh) {
    const suffix = stripWarehouseCodePrefix(code, wh);
    if (!suffix) return false;
    const suffixParts = suffix.split("-").filter(Boolean);
    if (suffixParts.length >= 3) return false;
    return suffixParts.length >= 1;
  }

  const parts = code.split("-").filter(Boolean);
  if (parts.length < 1) return false;
  if (parts.length >= 4) return false;
  return parts.length <= 3;
}

export function listWarehouseRooms(
  locations: InvLocation[],
  warehouseCode?: string,
): InvLocation[] {
  const wh = warehouseCode?.trim();
  return locations
    .filter((loc) => isWarehouseRoom(loc, wh))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Lokasi yang boleh dipakai untuk penempatan produk (sedikit lebih longgar dari daftar ruangan).
 */
export function isAssignableStorageLocation(
  loc: RoomLoc,
  warehouseCode?: string,
): boolean {
  if (!(loc.code ?? "").trim()) return false;
  if (parseLayoutFromName(loc.name ?? "")) return false;
  if (isRackSlotFields(loc)) return false;
  if (isWarehouseRoom(loc, warehouseCode)) return true;
  const wh = warehouseCode?.trim();
  const suffix = wh ? stripWarehouseCodePrefix(loc.code, wh) : loc.code;
  const parts = suffix.split("-").filter(Boolean);
  return parts.length >= 1 && parts.length < 4;
}

/** Alasan lokasi tidak masuk daftar ruangan (untuk pesan debug UI). */
export function explainNotWarehouseRoom(
  loc: RoomLoc,
  warehouseCode?: string,
): string | null {
  if (isWarehouseRoom(loc, warehouseCode)) return null;
  const code = (loc.code ?? "").trim();
  if (!code) return "kode kosong";
  if (parseLayoutFromName(loc.name ?? "")) return "rak induk (ada layout di nama)";
  if (isRackSlotFields(loc)) return "slot rak (ada level+bin)";
  const wh = warehouseCode?.trim();
  if (wh) {
    const suffix = stripWarehouseCodePrefix(code, wh);
    const n = suffix.split("-").filter(Boolean).length;
    if (!suffix) return "kode sama dengan kode gudang";
    if (n >= 3) return `terlalu banyak segmen setelah ${wh} (${suffix})`;
  }
  const parts = code.split("-").filter(Boolean).length;
  if (parts >= 4) return `kode slot 4+ segmen (${code})`;
  return `format tidak dikenali (${code})`;
}
