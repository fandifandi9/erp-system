import { pb } from "@/lib/pocketbase";
import { buildWorkstationQrPayload } from "./workstation-qr";

export type WmsWorkstation = {
  id: string;
  code: string;
  name: string;
  location: string;
  cctv: string;
  qr_payload?: string;
  is_active?: boolean;
};

export function workstationFromRow(row: Record<string, unknown>): WmsWorkstation {
  const code = String(row.code ?? row.id ?? "WS").trim();
  return {
    id: String(row.id),
    code,
    name: String(row.name ?? code),
    location: String(row.location ?? "—"),
    cctv: String(row.cctv ?? "—"),
    qr_payload:
      typeof row.qr_payload === "string" && row.qr_payload.trim()
        ? row.qr_payload.trim()
        : buildWorkstationQrPayload(code),
    is_active: row.is_active !== false,
  };
}

const STORAGE_KEY = "wms_active_workstation_v1";
const COLLECTION = "wms_workstations";

function defaultWs(
  id: string,
  code: string,
  name: string,
  location: string,
  cctv: string,
): WmsWorkstation {
  return {
    id,
    code,
    name,
    location,
    cctv,
    qr_payload: buildWorkstationQrPayload(code),
    is_active: true,
  };
}

export const DEFAULT_WMS_WORKSTATIONS: WmsWorkstation[] = [
  defaultWs("ws-default-01", "VALIDATOR-01", "Meja Validator 01", "Gudang — zona validasi A", "CCTV-V01"),
  defaultWs("ws-default-02", "VALIDATOR-02", "Meja Validator 02", "Gudang — zona validasi B", "CCTV-V02"),
  defaultWs("ws-default-03", "VALIDATOR-03", "Meja Validator 03", "Gudang — zona validasi C", "CCTV-V03"),
];

export async function fetchWmsWorkstations(): Promise<WmsWorkstation[]> {
  try {
    const rows = await pb.collection(COLLECTION).getFullList({
      filter: "is_active = true",
      sort: "code",
      requestKey: null,
    });
    if (rows.length === 0) return DEFAULT_WMS_WORKSTATIONS;
    return rows.map((r) => workstationFromRow(r as Record<string, unknown>));
  } catch {
    return DEFAULT_WMS_WORKSTATIONS;
  }
}

export function getActiveWorkstation(): WmsWorkstation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WmsWorkstation;
  } catch {
    return null;
  }
}

export function setActiveWorkstation(ws: WmsWorkstation | null): void {
  if (typeof window === "undefined") return;
  if (!ws) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
}
