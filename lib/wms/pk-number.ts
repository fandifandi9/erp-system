import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

const PK_SEQ_PAD = 5;
const PK_SEQ_MAX = 99999;
const LEGACY_PK_RE = /^PK-\d{8}-(\d{5})$/i;
const NEW_PK_RE = /^\d{5}$/;

function escapeFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Tampilan & penyimpanan: 5 digit numerik legacy, atau kode alfanumerik penuh (nomor SO/POS). */
export function formatPkDisplay(pkNo: string): string {
  const s = pkNo.trim();
  if (!s) return "—";
  if (NEW_PK_RE.test(s)) return s;
  const legacy = s.match(LEGACY_PK_RE);
  if (legacy) return legacy[1]!;
  if (/[A-Za-z]/.test(s)) return s.toUpperCase();
  if (/^\d{1,5}$/.test(s)) return s.padStart(PK_SEQ_PAD, "0");
  return s;
}

/**
 * Badan nomor PK untuk tampilan/scan — tanpa awalan "PK" (PK hanya label UI).
 * Contoh: PKSA9PY4ZR → SA9PY4ZR; PK 00001 → 00001; SA9PY4ZR tetap.
 * Tidak memotong kode acak 8 karakter yang kebetulan diawali "PK" (mis. PKMNPQRS).
 */
export function pkCodeBody(pkNo: string): string {
  const s = formatPkDisplay(pkNo);
  if (!s || s === "—") return s;
  // Legacy glue: "PK" + body 8 char (kode pickup lama).
  if (/^PK[A-Z0-9]{8}$/i.test(s)) return s.slice(2).toUpperCase();
  // "PK" + 5 digit, atau "PK " / "PK-" + sisa.
  if (/^PK\d{5}$/i.test(s)) return s.slice(2);
  if (/^PK[\s\-_]+/i.test(s)) {
    const rest = s.replace(/^PK[\s\-_]+/i, "").trim();
    if (rest) return rest.toUpperCase();
  }
  return s.toUpperCase();
}

/** Kunci banding scan PK — case-insensitive, awalan PK opsional. */
export function normalizePkCompareKey(value: string): string {
  const parsed = parsePkScanPayload(value) ?? value.trim();
  return pkCodeBody(parsed);
}

export function buildPkQrPayload(pkNo: string): string {
  return `serba:pk:${pkCodeBody(pkNo)}`;
}

export function isPkNumber(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (NEW_PK_RE.test(s)) return true;
  if (LEGACY_PK_RE.test(s)) return true;
  if (/^\d{1,5}$/.test(s)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9\-_. ]{1,48}$/.test(s)) return true;
  return false;
}

/** Parse scan QR/barcode PK → 5 digit (mis. 00042). */
export function parsePkScanPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith("serba:pk:")) {
    const v = s.slice("serba:pk:".length).trim();
    return isPkNumber(v) ? formatPkDisplay(v) : v || null;
  }
  if (isPkNumber(s)) return formatPkDisplay(s);
  return null;
}

function pkNumericValue(pkNo: string): number {
  const n = Number(formatPkDisplay(pkNo));
  return Number.isFinite(n) ? n : 0;
}

/** Nomor PK global urut — 00001, 00002, … (tanpa tanggal). */
export async function nextPkNumber(pocket: PocketBase = pb): Promise<string> {
  try {
    const res = await pocket.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 500, {
      filter: 'pk_no != "" && pk_no != null',
      sort: "-created",
      fields: "pk_no",
      requestKey: null,
    });
    let max = 0;
    for (const row of res.items) {
      const v = String((row as { pk_no?: string }).pk_no ?? "").trim();
      if (!v) continue;
      max = Math.max(max, pkNumericValue(v));
    }
    const next = max + 1;
    if (next > PK_SEQ_MAX) {
      throw new Error(`Nomor PK sudah penuh (maks. ${PK_SEQ_MAX}).`);
    }
    return String(next).padStart(PK_SEQ_PAD, "0");
  } catch (e) {
    if (e instanceof Error && e.message.includes("penuh")) throw e;
    return String(1).padStart(PK_SEQ_PAD, "0");
  }
}

/** Untuk filter PocketBase — coba beberapa bentuk kode. */
export function pkSearchVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const out = new Set<string>();
  if (!trimmed) return [];
  out.add(trimmed);
  out.add(trimmed.toUpperCase());
  out.add(trimmed.toLowerCase());
  const parsed = parsePkScanPayload(trimmed);
  if (parsed) {
    out.add(parsed);
    out.add(parsed.toUpperCase());
  }
  const body = pkCodeBody(trimmed);
  if (body && body !== "—") {
    out.add(body);
    out.add(`PK${body}`);
    out.add(`pk${body.toLowerCase()}`);
  }
  if (/^\d{1,5}$/.test(trimmed)) out.add(trimmed.padStart(PK_SEQ_PAD, "0"));
  return [...out];
}

/** @deprecated Hanya kompatibilitas lama — jangan dipakai format baru. */
export function pkDayStamp(date: string | Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date.includes("T") ? date : `${date}T12:00:00`) : date;
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
