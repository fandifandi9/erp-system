import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { persistLocation } from "@/lib/inventory/location-save";
import type { RackSlotDraft } from "@/lib/inventory/rack-builder";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { ClientResponseError } from "pocketbase";

type BatchBody = {
  warehouse: string;
  zone_type?: string;
  slots: RackSlotDraft[];
};

async function getLocationPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

function isDuplicateError(err: unknown): boolean {
  if (!(err instanceof ClientResponseError)) return false;
  const msg = `${err.message} ${JSON.stringify(err.data ?? {})}`.toLowerCase();
  return err.status === 400 && (msg.includes("unique") || msg.includes("sudah dipakai") || msg.includes("duplicate"));
}

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin mengelola lokasi rak.", 403);
    }

    const body = (await req.json()) as BatchBody;
    if (!body.warehouse?.trim()) {
      throw new InventoryApiError("Gudang wajib dipilih.", 400);
    }
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      throw new InventoryApiError("Minimal satu slot rak.", 400);
    }
    if (body.slots.length > 200) {
      throw new InventoryApiError("Maksimal 200 slot per sekali simpan.", 400);
    }

    const pb = await getLocationPb(req, auth);
    const zoneType = body.zone_type?.trim() || "rack";

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const records: unknown[] = [];

    for (const slot of body.slots) {
      if (!slot.code?.trim()) {
        errors.push("Slot tanpa kode dilewati.");
        continue;
      }
      try {
        const record = await persistLocation(pb, {
          warehouse: body.warehouse,
          code: slot.code,
          name: slot.name || slot.code,
          zone_type: zoneType,
          aisle: slot.aisle,
          level: slot.level,
          bin: slot.bin,
        });
        records.push(record);
        created += 1;
      } catch (err) {
        if (isDuplicateError(err)) {
          skipped += 1;
          continue;
        }
        const msg = err instanceof Error ? err.message : "Gagal simpan slot";
        errors.push(`${slot.code}: ${msg}`);
      }
    }

    if (created === 0 && errors.length > 0) {
      throw new InventoryApiError(errors.slice(0, 5).join("\n"), 400);
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      errors,
      records,
    });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan rak.");
  }
}
