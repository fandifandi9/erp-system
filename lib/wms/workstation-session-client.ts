import { getOrCreateDeviceId } from "@/lib/device-fingerprint";
import type { WmsSessionChannel } from "./workstation-session";
import type { WmsWorkstation } from "./workstations";

export type WorkstationSessionDto = {
  id: string;
  userId: string | null;
  workstation: WmsWorkstation;
  channel: WmsSessionChannel;
  deviceId?: string;
  bonusEligible: boolean;
  checkInAt: string;
  needsBind: boolean;
};

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; error?: string }> {
  return res.json() as Promise<T & { ok?: boolean; error?: string }>;
}

export function getWmsDeviceId(): string {
  return getOrCreateDeviceId();
}

export async function fetchActiveWorkstationSession(): Promise<WorkstationSessionDto | null> {
  const deviceId = getWmsDeviceId();
  const res = await fetch(
    `/api/wms/workstations/sessions/active?device_id=${encodeURIComponent(deviceId)}`,
    { credentials: "include" },
  );
  const json = await parseJson<{ data: WorkstationSessionDto | null }>(res);
  if (!res.ok) throw new Error(json.error ?? "Gagal memuat sesi meja");
  return json.data ?? null;
}

export type WorkstationDeskConfig = {
  checkInEnabled: boolean;
  lockedCodes: string[];
  desks: {
    code: string;
    name: string;
    location: string;
    cctv: string;
    qr_payload: string;
    locked: boolean;
    active: boolean;
  }[];
};

export async function fetchWorkstationDeskConfig(): Promise<WorkstationDeskConfig> {
  const res = await fetch("/api/wms/workstations/config", { credentials: "include" });
  const json = await parseJson<{ data: WorkstationDeskConfig }>(res);
  if (!res.ok || !json.data) throw new Error(json.error ?? "Gagal memuat config meja");
  return json.data;
}

/** Paste VALIDATOR-01 atau serba:ws:VALIDATOR-01 */
export async function checkInWorkstationDesk(input: {
  desk_input: string;
  channel?: WmsSessionChannel;
  device_id?: string;
}): Promise<WorkstationSessionDto> {
  const res = await fetch("/api/wms/workstations/checkin", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      desk_input: input.desk_input.trim(),
      channel: input.channel ?? "web_desk_scan",
      device_id: input.device_id ?? getWmsDeviceId(),
    }),
  });
  const json = await parseJson<{ data: WorkstationSessionDto; error?: string }>(res);
  if (!res.ok || !json.data) throw new Error(json.error ?? "Check-in meja gagal");
  return json.data;
}

export async function checkOutWorkstationDesk(
  sessionId: string,
  reason = "checkout",
): Promise<void> {
  const res = await fetch("/api/wms/workstations/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      device_id: getWmsDeviceId(),
      reason,
    }),
  });
  const json = await parseJson<{ error?: string }>(res);
  if (!res.ok) throw new Error(json.error ?? "Check-out meja gagal");
}

export async function bindWorkstationSession(sessionId: string): Promise<WorkstationSessionDto> {
  const res = await fetch("/api/wms/workstations/sessions/bind", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  const json = await parseJson<{ data: WorkstationSessionDto; error?: string }>(res);
  if (!res.ok || !json.data) throw new Error(json.error ?? "Hubungkan sesi gagal");
  return json.data;
}
