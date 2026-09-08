/**
 * Phase fix — Offices (GPS) CRUD via admin PB.
 * Client PB updateRule only allows legacy HR/Owner; Staff+HR FULL gets 404 on direct client writes.
 */

import type PocketBase from "pocketbase";
import {
  assertHrAdminSurface,
  isHrOperationalActor,
} from "@/lib/access/hr-api-enforcement";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";

export type OfficeRecord = {
  id: string;
  name: string;
  code?: string;
  lat: number;
  lng: number;
  radius: number;
  is_active: boolean;
  address?: string;
  max_checkin_distance?: number;
  timezone?: string;
};

export type OfficeWriteInput = {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  is_active?: boolean;
  address?: string;
  max_checkin_distance?: number;
  timezone?: string;
  code?: string;
};

function mapOffice(rec: Record<string, unknown>): OfficeRecord {
  return {
    id: String(rec.id ?? ""),
    name: String(rec.name ?? ""),
    code: String(rec.code ?? "").trim() || undefined,
    lat: Number(rec.lat),
    lng: Number(rec.lng),
    radius: Number(rec.radius) || 100,
    is_active: rec.is_active !== false,
    address: String(rec.address ?? "").trim() || undefined,
    max_checkin_distance:
      rec.max_checkin_distance != null && Number.isFinite(Number(rec.max_checkin_distance))
        ? Number(rec.max_checkin_distance)
        : undefined,
    timezone: String(rec.timezone ?? "").trim() || undefined,
  };
}

function validateOfficeInput(input: OfficeWriteInput): void {
  const name = String(input.name ?? "").trim();
  if (!name) throw new HrApiError("Nama kantor wajib diisi.", 400);
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new HrApiError("Koordinat tidak valid.", 400);
  }
  if (input.lat < -90 || input.lat > 90) throw new HrApiError("Latitude di luar rentang.", 400);
  if (input.lng < -180 || input.lng > 180) throw new HrApiError("Longitude di luar rentang.", 400);
  if (!Number.isFinite(input.radius) || input.radius < 10 || input.radius > 1000) {
    throw new HrApiError("Radius harus 10–1000 meter.", 400);
  }
}

function toWriteBody(input: OfficeWriteInput): Record<string, unknown> {
  validateOfficeInput(input);
  return {
    name: String(input.name).trim(),
    lat: Number(input.lat),
    lng: Number(input.lng),
    radius: Number(input.radius),
    is_active: input.is_active !== false,
    address: String(input.address ?? "").trim(),
    max_checkin_distance: Number(input.max_checkin_distance ?? 0) || 0,
    timezone: String(input.timezone ?? "Asia/Jakarta").trim() || "Asia/Jakarta",
    ...(input.code != null ? { code: String(input.code).trim() } : {}),
  };
}

export async function serverListOffices(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<OfficeRecord[]> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  const rows = await adminPb.collection("offices").getFullList({
    sort: "-created",
    requestKey: null,
  });
  return rows.map((r) => mapOffice(r as unknown as Record<string, unknown>));
}

export async function serverCreateOffice(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: OfficeWriteInput,
): Promise<OfficeRecord> {
  assertHrAdminSurface(ctx, "Hanya Owner/HR yang dapat mengelola kantor.");
  const body = toWriteBody(input);
  const rec = (await adminPb.collection("offices").create(body, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  return mapOffice(rec);
}

export async function serverUpdateOffice(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  officeId: string,
  input: Partial<OfficeWriteInput> & { is_active?: boolean },
): Promise<OfficeRecord> {
  assertHrAdminSurface(ctx, "Hanya Owner/HR yang dapat mengelola kantor.");
  const id = String(officeId || "").trim();
  if (!id) throw new HrApiError("ID kantor tidak valid.", 400);

  let existing: Record<string, unknown>;
  try {
    existing = (await adminPb.collection("offices").getOne(id, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
  } catch {
    throw new HrApiError("Kantor tidak ditemukan.", 404);
  }

  const merged: OfficeWriteInput = {
    name: input.name != null ? String(input.name) : String(existing.name ?? ""),
    lat: input.lat != null ? Number(input.lat) : Number(existing.lat),
    lng: input.lng != null ? Number(input.lng) : Number(existing.lng),
    radius: input.radius != null ? Number(input.radius) : Number(existing.radius) || 100,
    is_active:
      typeof input.is_active === "boolean" ? input.is_active : existing.is_active !== false,
    address: input.address != null ? String(input.address) : String(existing.address ?? ""),
    max_checkin_distance:
      input.max_checkin_distance != null
        ? Number(input.max_checkin_distance)
        : Number(existing.max_checkin_distance ?? 0),
    timezone:
      input.timezone != null ? String(input.timezone) : String(existing.timezone ?? "Asia/Jakarta"),
  };

  // Partial toggle-only updates still validate coords from existing record.
  const body = toWriteBody(merged);
  const rec = (await adminPb.collection("offices").update(id, body, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  return mapOffice(rec);
}

export async function serverDeleteOffice(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  officeId: string,
): Promise<void> {
  if (!ctx.isOwner) {
    throw new HrApiError("Hanya Owner yang dapat menghapus kantor.", 403);
  }
  const id = String(officeId || "").trim();
  if (!id) throw new HrApiError("ID kantor tidak valid.", 400);
  try {
    await adminPb.collection("offices").delete(id, { requestKey: null });
  } catch {
    throw new HrApiError("Kantor tidak ditemukan atau gagal dihapus.", 404);
  }
}
