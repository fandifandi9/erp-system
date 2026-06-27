import type PocketBase from "pocketbase";
import { parseWorkstationQrPayload } from "./workstation-qr";
import { assertWorkstationAvailableForCheckIn } from "./workstation-config";
import {
  DEFAULT_WMS_WORKSTATIONS,
  type WmsWorkstation,
  workstationFromRow,
} from "./workstations";

export const WMS_WORKSTATION_SESSIONS = "wms_workstation_sessions";

export type WmsSessionChannel = "mobile" | "office_terminal" | "web_desk_scan";

export type WmsWorkstationSessionRow = {
  id: string;
  user?: string;
  workstation_id?: string;
  workstation_code?: string;
  workstation_name?: string;
  workstation_location?: string;
  workstation_cctv?: string;
  status?: string;
  channel?: WmsSessionChannel;
  device_id?: string;
  bonus_eligible?: boolean;
  check_in_at?: string;
  check_out_at?: string;
  closed_reason?: string;
  bound_at?: string;
  via_qr?: boolean;
};

export type ActiveWorkstationSession = {
  id: string;
  userId: string | null;
  workstation: WmsWorkstation;
  channel: WmsSessionChannel;
  deviceId?: string;
  bonusEligible: boolean;
  checkInAt: string;
  needsBind: boolean;
};

function esc(s: string): string {
  return s.replace(/"/g, '\\"');
}

export async function findWorkstationByQrPayload(
  pb: PocketBase,
  qrPayload: string,
): Promise<WmsWorkstation | null> {
  const raw = qrPayload.trim();
  const parsed = parseWorkstationQrPayload(raw);

  try {
    const byPayload = await pb.collection("wms_workstations").getList(1, 1, {
      filter: `qr_payload = "${esc(raw)}"`,
      requestKey: null,
    });
    if (byPayload.items[0]) {
      return workstationFromRow(byPayload.items[0] as Record<string, unknown>);
    }
  } catch {
    /* koleksi opsional */
  }

  const code = parsed?.code ?? raw.trim().toUpperCase();
  if (!code) return null;

  try {
    const byCode = await pb.collection("wms_workstations").getList(1, 1, {
      filter: `code = "${esc(code)}"`,
      requestKey: null,
    });
    if (byCode.items[0]) {
      return workstationFromRow(byCode.items[0] as Record<string, unknown>);
    }
  } catch {
    /* fallback default */
  }

  return (
    DEFAULT_WMS_WORKSTATIONS.find((w) => w.code.toUpperCase() === code) ?? null
  );
}

async function closeActiveSessions(
  pb: PocketBase,
  filter: string,
  reason: string,
): Promise<void> {
  try {
    const list = await pb.collection(WMS_WORKSTATION_SESSIONS).getFullList({
      filter: `${filter} && status = "active"`,
      requestKey: null,
    });
    const now = new Date().toISOString();
    for (const row of list) {
      await pb.collection(WMS_WORKSTATION_SESSIONS).update(row.id, {
        status: "closed",
        check_out_at: now,
        closed_reason: reason,
      });
    }
  } catch {
    throw new Error(
      "Koleksi wms_workstation_sessions belum ada. Jalankan: node scripts/fix-pb-wms-workstation-sessions-schema.mjs",
    );
  }
}

function rowToActiveSession(row: WmsWorkstationSessionRow): ActiveWorkstationSession | null {
  const code = row.workstation_code?.trim();
  if (!code) return null;
  const ws: WmsWorkstation = {
    id: row.workstation_id ?? `ws-${code}`,
    code,
    name: row.workstation_name ?? code,
    location: row.workstation_location ?? "—",
    cctv: row.workstation_cctv ?? "—",
    is_active: true,
  };
  const channel = (row.channel ?? "web_desk_scan") as WmsSessionChannel;
  const userId = row.user?.trim() ? row.user : null;
  const needsBind = channel === "office_terminal" && !userId;
  return {
    id: row.id,
    userId,
    workstation: ws,
    channel,
    deviceId: row.device_id,
    bonusEligible: row.bonus_eligible === true,
    checkInAt: row.check_in_at ?? new Date().toISOString(),
    needsBind,
  };
}

export async function getActiveWorkstationSessionForUser(
  pb: PocketBase,
  userId: string,
): Promise<ActiveWorkstationSession | null> {
  try {
    const list = await pb.collection(WMS_WORKSTATION_SESSIONS).getList(1, 1, {
      filter: `user = "${esc(userId)}" && status = "active"`,
      sort: "-check_in_at",
      requestKey: null,
    });
    const row = list.items[0] as unknown as WmsWorkstationSessionRow | undefined;
    return row ? rowToActiveSession(row) : null;
  } catch {
    return null;
  }
}

export async function getActiveWorkstationSessionForDevice(
  pb: PocketBase,
  deviceId: string,
): Promise<ActiveWorkstationSession | null> {
  if (!deviceId.trim()) return null;
  try {
    const list = await pb.collection(WMS_WORKSTATION_SESSIONS).getList(1, 1, {
      filter: `device_id = "${esc(deviceId)}" && status = "active"`,
      sort: "-check_in_at",
      requestKey: null,
    });
    const row = list.items[0] as unknown as WmsWorkstationSessionRow | undefined;
    return row ? rowToActiveSession(row) : null;
  } catch {
    return null;
  }
}

/** Sesi yang boleh dipakai di WMS PC: milik user atau terminal terikat ke user. */
export async function resolveWorkstationSessionForOperator(
  pb: PocketBase,
  userId: string,
  deviceId?: string,
): Promise<ActiveWorkstationSession | null> {
  const byUser = await getActiveWorkstationSessionForUser(pb, userId);
  if (byUser) return byUser;

  if (!deviceId?.trim()) return null;
  const byDevice = await getActiveWorkstationSessionForDevice(pb, deviceId);
  if (!byDevice) return null;
  if (byDevice.needsBind) return byDevice;
  if (byDevice.userId === userId) return byDevice;
  return null;
}

export function assertSessionAllowsValidation(
  session: ActiveWorkstationSession | null,
  userId: string,
): void {
  if (!session) {
    throw new Error(
      "Belum ada sesi meja aktif. Scan QR meja (HP absensi atau scanner di meja) terlebih dahulu.",
    );
  }
  if (session.needsBind) {
    throw new Error(
      "Meja sudah discan dari terminal — klik «Hubungkan ke akun saya» di bilah atas sebelum validasi paket.",
    );
  }
  if (session.userId && session.userId !== userId) {
    throw new Error("Sesi meja aktif milik pengguna lain.");
  }
  if (!session.bonusEligible && session.channel === "office_terminal") {
    /* tetap boleh validasi setelah bind; bonus flag hanya pelaporan */
  }
}

export async function checkInWorkstation(
  pb: PocketBase,
  workstation: WmsWorkstation,
  opts: {
    userId?: string;
    channel: WmsSessionChannel;
    deviceId?: string;
    viaQr?: boolean;
    devicePlatform?: string;
  },
): Promise<ActiveWorkstationSession> {
  const now = new Date().toISOString();
  const channel = opts.channel;
  const userId = opts.userId?.trim() || "";

  if (channel === "office_terminal") {
    if (!opts.deviceId?.trim()) {
      throw new Error("device_id wajib untuk terminal kantor.");
    }
    await closeActiveSessions(
      pb,
      `device_id = "${esc(opts.deviceId)}"`,
      "auto_close_terminal_checkin",
    );
  } else if (userId) {
    await closeActiveSessions(pb, `user = "${esc(userId)}"`, "auto_close_checkin_new_desk");
  }

  const bonusEligible =
    channel === "mobile" || channel === "web_desk_scan" ? Boolean(userId) : false;

  const data: Record<string, unknown> = {
    workstation_id: workstation.id.startsWith("ws-default") ? "" : workstation.id,
    workstation_code: workstation.code,
    workstation_name: workstation.name,
    workstation_location: workstation.location,
    workstation_cctv: workstation.cctv,
    status: "active",
    channel,
    device_id: opts.deviceId ?? "",
    bonus_eligible: bonusEligible,
    check_in_at: now,
    via_qr: opts.viaQr === true,
  };
  if (userId) data.user = userId;

  let created: WmsWorkstationSessionRow;
  try {
    created = (await pb.collection(WMS_WORKSTATION_SESSIONS).create(data, {
      requestKey: null,
    })) as unknown as WmsWorkstationSessionRow;
  } catch {
    throw new Error(
      "Gagal membuat sesi meja. Jalankan: node scripts/fix-pb-wms-workstation-sessions-schema.mjs",
    );
  }

  const active = rowToActiveSession(created);
  if (!active) throw new Error("Sesi meja tidak valid.");
  return active;
}

export async function bindWorkstationSessionToUser(
  pb: PocketBase,
  sessionId: string,
  userId: string,
): Promise<ActiveWorkstationSession> {
  const row = (await pb
    .collection(WMS_WORKSTATION_SESSIONS)
    .getOne(sessionId)) as unknown as WmsWorkstationSessionRow;

  if (row.status !== "active") {
    throw new Error("Sesi meja tidak aktif.");
  }
  if (row.channel !== "office_terminal") {
    throw new Error("Hanya sesi terminal kantor yang perlu dihubungkan ke akun.");
  }

  await closeActiveSessions(pb, `user = "${esc(userId)}"`, "auto_close_bind_terminal");

  const now = new Date().toISOString();
  const updated = (await pb.collection(WMS_WORKSTATION_SESSIONS).update(sessionId, {
    user: userId,
    bonus_eligible: true,
    bound_at: now,
  })) as unknown as WmsWorkstationSessionRow;

  const active = rowToActiveSession(updated);
  if (!active) throw new Error("Bind sesi gagal.");
  return { ...active, userId, needsBind: false, bonusEligible: true };
}

export async function checkOutWorkstationSession(
  pb: PocketBase,
  sessionId: string,
  opts: { userId?: string; deviceId?: string; reason?: string },
): Promise<void> {
  const row = (await pb
    .collection(WMS_WORKSTATION_SESSIONS)
    .getOne(sessionId)) as unknown as WmsWorkstationSessionRow;

  const userId = opts.userId?.trim();
  const deviceId = opts.deviceId?.trim();
  if (row.user) {
    if (!userId || row.user !== userId) {
      throw new Error("Sesi bukan milik Anda.");
    }
  } else if (deviceId) {
    if (row.device_id !== deviceId) {
      throw new Error("Perangkat tidak cocok dengan sesi terminal.");
    }
  } else if (userId) {
    /* terminal belum terikat — operator yang login boleh tutup */
  } else {
    throw new Error("Tidak dapat menutup sesi.");
  }

  const now = new Date().toISOString();
  await pb.collection(WMS_WORKSTATION_SESSIONS).update(sessionId, {
    status: "closed",
    check_out_at: now,
    closed_reason: opts.reason ?? "checkout",
  });
}

export async function resolveWorkstationFromInput(
  pb: PocketBase,
  input: { qr_payload?: string; workstation_code?: string },
): Promise<WmsWorkstation> {
  let ws: WmsWorkstation | null = null;

  if (input.qr_payload?.trim()) {
    ws = await findWorkstationByQrPayload(pb, input.qr_payload.trim());
    if (!ws) {
      throw new Error(
        "QR/kode meja tidak dikenali. Gunakan VALIDATOR-01 atau serba:ws:VALIDATOR-01.",
      );
    }
  } else if (input.workstation_code?.trim()) {
    ws = await findWorkstationByQrPayload(pb, input.workstation_code.trim());
    if (!ws) throw new Error("Kode meja tidak ditemukan.");
  } else {
    throw new Error("qr_payload atau workstation_code wajib.");
  }

  assertWorkstationAvailableForCheckIn(ws);
  return ws;
}
