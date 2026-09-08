import type { InvLocation } from "./types";
import { buildRackSlotCode, sanitizeRackSegment } from "./rack-builder";
import { stripPlacementFromName } from "./location-fields";

export type RackLayout = {
  levels: string[];
  slots: string[];
};

const LAYOUT_SUFFIX = /\s*\[layout:tingkat:([^|\]]*)\|slot:([^\]]*)\]\s*$/;

export function buildRackCode(aisle: string, rack: string): string {
  const a = sanitizeRackSegment(aisle);
  const r = sanitizeRackSegment(rack);
  if (!a || !r) return "";
  return `${a}-${r}`;
}

export function encodeLayoutInName(name: string, layout: RackLayout): string {
  const base = stripLayoutFromName(stripPlacementFromName(name));
  const levels = layout.levels.map((x) => x.trim()).filter(Boolean);
  const slots = layout.slots.map((x) => x.trim()).filter(Boolean);
  if (levels.length === 0 && slots.length === 0) return base;
  return `${base} [layout:tingkat:${levels.join(",")}|slot:${slots.join(",")}]`.trim();
}

export function stripLayoutFromName(name: string): string {
  return name.replace(LAYOUT_SUFFIX, "").trim();
}

export function parseLayoutFromName(name: string): RackLayout | null {
  const m = name.match(LAYOUT_SUFFIX);
  if (!m) return null;
  const levels = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const slots = m[2]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (levels.length === 0 && slots.length === 0) return null;
  return { levels, slots };
}

/** Rak induk: suffix layout di nama ([layout:tingkat:…|slot:…]). */
export function isRackMaster(loc: Pick<InvLocation, "name">): boolean {
  return !!parseLayoutFromName(loc.name ?? "");
}

export function getRackLayout(loc: Pick<InvLocation, "name">): RackLayout | null {
  return parseLayoutFromName(loc.name ?? "");
}

export function getRackDisplayName(loc: Pick<InvLocation, "name">): string {
  return stripLayoutFromName(stripPlacementFromName(loc.name ?? "")) || "—";
}

/** Kode slot fisik (untuk stok) — turunan dari kode rak induk. */
export function buildSlotCodeForRack(
  rackCode: string,
  level: string,
  slot: string,
): string {
  const parts = rackCode.split("-").filter(Boolean);
  if (parts.length < 2) return buildRackSlotCode(rackCode, "", level, slot);
  const aisle = parts[0];
  const rack = parts[1];
  return buildRackSlotCode(aisle, rack, level, slot);
}

/** Turunkan rak / tingkat / slot dari kode lokasi slot (mis. SER-A-1-01). */
export function parseSlotFromLocationCode(code: string): {
  rackCode: string;
  level: string;
  slot: string;
} {
  const parts = (code ?? "").trim().split("-").filter(Boolean);
  if (parts.length >= 4) {
    return {
      rackCode: `${parts[0]}-${parts[1]}`,
      level: parts[2],
      slot: parts.slice(3).join("-"),
    };
  }
  if (parts.length === 3) {
    return { rackCode: `${parts[0]}-${parts[1]}`, level: parts[2], slot: "" };
  }
  if (parts.length === 2) {
    return { rackCode: code.trim().toUpperCase(), level: "", slot: "" };
  }
  return { rackCode: code.trim().toUpperCase(), level: "", slot: "" };
}

export function listSlotCodesForLayout(rackCode: string, layout: RackLayout): string[] {
  const parts = rackCode.split("-").filter(Boolean);
  const aisle = parts[0] ?? "";
  const rack = parts[1] ?? rackCode;
  const codes: string[] = [];
  for (const level of layout.levels) {
    for (const slot of layout.slots) {
      codes.push(buildRackSlotCode(aisle, rack, level, slot));
    }
  }
  return codes;
}
