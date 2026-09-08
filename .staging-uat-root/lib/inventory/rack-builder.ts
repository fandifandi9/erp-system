/** Bangun banyak slot lokasi dari lorong + rak + daftar tingkat & slot. */

export type RackWizardInput = {
  aisle: string;
  rack: string;
  levels: string[];
  bins: string[];
};

export type RackSlotDraft = {
  code: string;
  name: string;
  aisle: string;
  rack: string;
  level: string;
  bin: string;
};

export function sanitizeRackSegment(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function buildRackSlotCode(aisle: string, rack: string, level: string, bin: string): string {
  return [aisle, rack, level, bin].map((p) => p.trim()).filter(Boolean).join("-").toUpperCase().replace(/\s+/g, "");
}

export function buildRackSlotName(rack: string, level: string, bin: string): string {
  return `Rak ${rack} · Tingkat ${level} · Slot ${bin}`;
}

export function buildRackSlots(input: RackWizardInput): RackSlotDraft[] {
  const aisle = sanitizeRackSegment(input.aisle);
  const rack = sanitizeRackSegment(input.rack);
  const levels = input.levels.map(sanitizeRackSegment).filter(Boolean);
  const bins = input.bins.map((b) => b.trim()).filter(Boolean);

  if (!aisle || !rack || levels.length === 0 || bins.length === 0) {
    return [];
  }

  const slots: RackSlotDraft[] = [];
  for (const level of levels) {
    for (const bin of bins) {
      slots.push({
        code: buildRackSlotCode(aisle, rack, level, bin),
        name: buildRackSlotName(rack, level, bin),
        aisle,
        rack,
        level,
        bin,
      });
    }
  }
  return slots;
}

/** Payload scan QR lokasi rak (sama pola dengan zona). */
export function buildLocationQrPayload(warehouseCode: string, locationCode: string): string {
  const wh = warehouseCode.trim().toUpperCase();
  const code = locationCode.trim().toUpperCase();
  return `serba:loc:${wh}:${code}`;
}
