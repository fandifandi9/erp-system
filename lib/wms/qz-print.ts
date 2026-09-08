"use client";

/**
 * Integrasi QZ Tray — cetak langsung ke printer tertentu tanpa dialog browser.
 * Butuh aplikasi "QZ Tray" terpasang & berjalan di komputer.
 *
 * Catatan keamanan: tanpa sertifikat, QZ menampilkan dialog "Allow" sekali
 * (bisa dicentang "remember"). Untuk benar-benar tanpa prompt, pasang
 * sertifikat & signature (lihat dokumentasi QZ Tray).
 */

// Dynamic import agar tidak dievaluasi saat SSR (qz-tray butuh window).
type QzDefault = typeof import("qz-tray")["default"];
let qzPromise: Promise<QzDefault> | null = null;

async function getQz(): Promise<QzDefault> {
  if (!qzPromise) {
    qzPromise = import("qz-tray").then((m) => m.default);
  }
  return qzPromise;
}

let connecting: Promise<void> | null = null;

export async function ensureQzConnected(): Promise<void> {
  const qz = await getQz();
  if (qz.websocket.isActive()) return;
  if (connecting) return connecting;
  connecting = qz.websocket
    .connect({ retries: 1, delay: 1 })
    .then(() => {
      connecting = null;
    })
    .catch((e: unknown) => {
      connecting = null;
      throw e;
    });
  return connecting!;
}

export async function isQzConnected(): Promise<boolean> {
  try {
    const qz = await getQz();
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

export async function listQzPrinters(): Promise<string[]> {
  await ensureQzConnected();
  const qz = await getQz();
  const found = await qz.printers.find();
  if (Array.isArray(found)) return found.filter((x): x is string => typeof x === "string");
  return typeof found === "string" ? [found] : [];
}

export async function getQzDefaultPrinter(): Promise<string | null> {
  try {
    await ensureQzConnected();
    const qz = await getQz();
    const def = await qz.printers.getDefault();
    return typeof def === "string" ? def : null;
  } catch {
    return null;
  }
}

/** Cetak HTML ke printer bernama (silent bila QZ sudah di-allow/ber-sertifikat). */
export async function printHtmlViaQz(
  printerName: string,
  html: string,
  opts?: { widthMm?: number; heightMm?: number },
): Promise<void> {
  await ensureQzConnected();
  const qz = await getQz();
  const configOpts: Record<string, unknown> = { units: "mm" };
  if (opts?.widthMm && opts?.heightMm) {
    configOpts.size = { width: opts.widthMm, height: opts.heightMm };
  }
  const config = qz.configs.create(printerName, configOpts);
  await qz.print(config, [
    { type: "pixel", format: "html", flavor: "plain", data: html },
  ]);
}

/** Cetak PDF (URL absolut atau data) ke printer bernama — untuk label AWB termal. */
export async function printPdfViaQz(printerName: string, pdfUrl: string): Promise<void> {
  await ensureQzConnected();
  const qz = await getQz();
  const config = qz.configs.create(printerName);
  const absolute = pdfUrl.startsWith("http")
    ? pdfUrl
    : new URL(pdfUrl, window.location.origin).href;
  await qz.print(config, [
    { type: "pixel", format: "pdf", flavor: "file", data: absolute },
  ]);
}

export async function disconnectQz(): Promise<void> {
  try {
    const qz = await getQz();
    if (qz.websocket.isActive()) await qz.websocket.disconnect();
  } catch {
    /* abaikan */
  }
}
