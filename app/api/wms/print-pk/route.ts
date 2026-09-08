import net from "node:net";
import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { buildPkEscpos, buildPkRasterEscpos, type EscposSlip } from "@/lib/wms/escpos-pk";

export const runtime = "nodejs";

type RasterInput = { widthDots: number; heightPx: number; dataB64: string };

type PrintPkBody = {
  host?: string;
  port?: number;
  widthMm?: number;
  slips?: EscposSlip[];
  /** Slip sebagai bitmap (identik dengan layout HTML) — diprioritaskan. */
  rasters?: RasterInput[];
};

function sendToPrinter(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(6000);
    socket.on("connect", () => {
      socket.write(data, () => {
        // beri waktu buffer terkirim sebelum tutup
        socket.end();
      });
    });
    socket.on("close", () => done());
    socket.on("error", (e) => done(e));
    socket.on("timeout", () => done(new Error("Koneksi ke printer timeout")));
  });
}

export async function POST(req: Request) {
  try {
    await requireInventoryAccess(req);
    const body = (await req.json()) as PrintPkBody;
    const host = body.host?.trim();
    const port = Number(body.port) || 9100;
    const rasters = Array.isArray(body.rasters) ? body.rasters : [];
    const slips = Array.isArray(body.slips) ? body.slips : [];

    if (!host) {
      return NextResponse.json({ ok: false, error: "IP printer belum diisi." }, { status: 400 });
    }
    if (rasters.length === 0 && slips.length === 0) {
      return NextResponse.json({ ok: false, error: "Tidak ada slip untuk dicetak." }, { status: 400 });
    }

    let bytes: Buffer;
    let count: number;
    if (rasters.length > 0) {
      const decoded = rasters.map((r) => ({
        widthDots: r.widthDots,
        heightPx: r.heightPx,
        bytes: Buffer.from(r.dataB64, "base64"),
      }));
      bytes = Buffer.from(buildPkRasterEscpos(decoded));
      count = rasters.length;
    } else {
      bytes = Buffer.from(buildPkEscpos(slips, { widthMm: body.widthMm }));
      count = slips.length;
    }

    await sendToPrinter(host, port, bytes);
    return NextResponse.json({ ok: true, printed: count });
  } catch (err) {
    return jsonError(err, "Gagal mengirim cetak ke printer jaringan.");
  }
}
