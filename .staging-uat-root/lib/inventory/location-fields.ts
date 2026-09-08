import type { InvLocation } from "./types";

export type LocationPlacement = {
  aisle: string;
  level: string;
  bin: string;
  fromFields: boolean;
};

export function formatPlacementSummary(
  loc: Pick<InvLocation, "code" | "name" | "aisle" | "level" | "bin">,
): string {
  const p = getLocationPlacement(loc);
  const bits = [loc.code, p.aisle, p.level, p.bin].filter(Boolean);
  return bits.join(" → ");
}

const PLACEMENT_SUFFIX = /\s*\[gang:([^|\]]*)\|tingkat:([^|\]]*)\|bin:([^\]]*)\]\s*$/;

/** Simpan gang/tingkat/bin di nama jika field PB belum ada. */
export function encodePlacementInName(
  name: string,
  placement: { aisle?: string; level?: string; bin?: string },
): string {
  const base = stripPlacementFromName(name);
  const a = placement.aisle?.trim() ?? "";
  const l = placement.level?.trim() ?? "";
  const b = placement.bin?.trim() ?? "";
  if (!a && !l && !b) return base;
  return `${base} [gang:${a}|tingkat:${l}|bin:${b}]`.trim();
}

export function stripPlacementFromName(name: string): string {
  return name.replace(PLACEMENT_SUFFIX, "").trim();
}

/** Gang/tingkat/bin sudah tersimpan di PB (field atau suffix di nama). */
export function hasStoredPlacement(
  loc: Pick<InvLocation, "name" | "aisle" | "level" | "bin">,
): boolean {
  if (loc.aisle?.trim() || loc.level?.trim() || loc.bin?.trim()) return true;
  return PLACEMENT_SUFFIX.test(loc.name ?? "");
}

/** Saran kode dari gang / tingkat / bin, mis. SER + 1 + A-001 → SER-1-A-001 */
export function buildLocationCodeFromPlacement(
  aisle: string,
  level: string,
  bin: string,
): string {
  const parts = [aisle, level, bin].map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.join("-").toUpperCase().replace(/\s+/g, "");
}

/** Baca gang / tingkat / bin — field PB, suffix di nama, label nama, lalu kode. */
export function getLocationPlacement(loc: Pick<InvLocation, "code" | "name" | "aisle" | "level" | "bin">): LocationPlacement {
  const aisle = (loc.aisle ?? "").trim();
  const level = (loc.level ?? "").trim();
  const bin = (loc.bin ?? "").trim();
  if (aisle || level || bin) {
    return { aisle, level, bin, fromFields: true };
  }

  const fromSuffix = parsePlacementFromName(loc.name ?? "");
  if (fromSuffix && (fromSuffix.aisle || fromSuffix.level || fromSuffix.bin)) {
    return { ...fromSuffix, fromFields: false };
  }

  const displayName = stripPlacementFromName(loc.name ?? "");
  const baris = displayName.match(/baris\s*(\d+)/i);
  const rak = displayName.match(/rak\s*([A-Za-z0-9]+)/i);
  if (rak || baris) {
    return {
      aisle: rak ? rak[1] : displayName,
      level: baris ? baris[1] : "",
      bin: "",
      fromFields: false,
    };
  }

  const code = (loc.code ?? "").trim();
  const parts = code.split("-").filter(Boolean);
  if (parts.length >= 4) {
    return {
      aisle: parts[0],
      level: parts[1],
      bin: parts.slice(2).join("-"),
      fromFields: false,
    };
  }
  if (parts.length === 3) {
    return {
      aisle: parts[0],
      level: parts[1],
      bin: parts[2],
      fromFields: false,
    };
  }
  if (parts.length === 2) {
    return { aisle: parts[0], level: parts[1], bin: "", fromFields: false };
  }

  if (displayName) {
    return { aisle: displayName, level: "", bin: "", fromFields: false };
  }

  return { aisle: "", level: "", bin: "", fromFields: false };
}

function parsePlacementFromName(name: string): { aisle: string; level: string; bin: string } | null {
  const m = name.match(PLACEMENT_SUFFIX);
  if (!m) return null;
  return { aisle: m[1].trim(), level: m[2].trim(), bin: m[3].trim() };
}
