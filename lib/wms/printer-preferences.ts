"use client";

/** Preferensi printer khusus cetak slip PK (disimpan lokal per perangkat). */

export type PkPrintMode = "browser" | "qz" | "network";

const MODE_KEY = "wms_pk_print_mode";
const PK_PRINTER_KEY = "wms_pk_printer_name"; // untuk mode QZ
const NET_HOST_KEY = "wms_pk_net_host";
const NET_PORT_KEY = "wms_pk_net_port";
const NET_WIDTH_KEY = "wms_pk_net_width";

function read(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function write(key: string, val: string): void {
  if (typeof window === "undefined") return;
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export function getPkPrintMode(): PkPrintMode {
  const v = read(MODE_KEY);
  return v === "qz" || v === "network" ? v : "browser";
}

export function setPkPrintMode(mode: PkPrintMode): void {
  write(MODE_KEY, mode);
}

// ── Mode QZ (printer lokal / driver Windows) ──
export function getPkPrinterName(): string {
  return read(PK_PRINTER_KEY);
}
export function setPkPrinterName(name: string): void {
  write(PK_PRINTER_KEY, name.trim());
}

// ── Mode Jaringan (WiFi/LAN, ESC/POS ke IP:port) ──
export type PkNetworkConfig = { host: string; port: number; widthMm: number };

export function getPkNetworkConfig(): PkNetworkConfig {
  const host = read(NET_HOST_KEY);
  const port = Number(read(NET_PORT_KEY)) || 9100;
  const widthMm = Number(read(NET_WIDTH_KEY)) || 58;
  return { host, port, widthMm };
}

export function setPkNetworkConfig(cfg: Partial<PkNetworkConfig>): void {
  if (cfg.host !== undefined) write(NET_HOST_KEY, cfg.host.trim());
  if (cfg.port !== undefined) write(NET_PORT_KEY, String(cfg.port || 9100));
  if (cfg.widthMm !== undefined) write(NET_WIDTH_KEY, String(cfg.widthMm || 58));
}
