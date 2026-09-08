import { getAppBaseUrl, isResendConfigured } from "@/lib/email/resend";
import { getDefaultFromName, resolveEmailSender } from "@/lib/email/sender";
import { sendViaResend } from "@/lib/email/send-via-resend";

export function buildPkReadyEmailHtml(opts: {
  customerName?: string;
  orderNo: string;
  pkNo: string;
  storeName?: string;
}): string {
  const name = opts.customerName?.trim() || "Pelanggan";
  const store = opts.storeName?.trim() || "toko kami";
  return `<!DOCTYPE html><html lang="id"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
  <p>Halo ${escapeHtml(name)},</p>
  <p>Pesanan <strong>${escapeHtml(opts.orderNo)}</strong> siap diproses untuk <strong>ambil sendiri</strong> di ${escapeHtml(store)}.</p>
  <p style="font-size:15px">Nomor pengambilan (PK) Anda:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:0.04em;font-family:Consolas,monospace;margin:8px 0">${escapeHtml(opts.pkNo)}</p>
  <p>Tunjukkan atau sebutkan nomor PK ini ke tim gudang saat mengambil paket (boleh diwakilkan).</p>
  <p style="color:#64748b;font-size:13px">Simpan email ini sampai paket diambil.</p>
</body></html>`;
}

export function buildPkReadyEmailText(opts: {
  customerName?: string;
  orderNo: string;
  pkNo: string;
  storeName?: string;
}): string {
  const name = opts.customerName?.trim() || "Pelanggan";
  const store = opts.storeName?.trim() || "toko kami";
  return [
    `Halo ${name},`,
    ``,
    `Pesanan ${opts.orderNo} siap diproses untuk ambil sendiri di ${store}.`,
    ``,
    `Nomor pengambilan (PK): ${opts.pkNo}`,
    ``,
    `Tunjukkan atau sebutkan nomor PK ini ke tim gudang saat mengambil paket.`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPkReadyEmail(opts: {
  to: string;
  customerName?: string;
  orderNo: string;
  pkNo: string;
  storeName?: string;
  store?: Parameters<typeof resolveEmailSender>[0];
  req?: Request;
}): Promise<{ to: string; id: string }> {
  if (!isResendConfigured()) {
    throw new Error(
      "Resend belum dikonfigurasi. Set RESEND_API_KEY dan RESEND_FROM_EMAIL di .env.local.",
    );
  }
  void getAppBaseUrl(opts.req);
  const sender = resolveEmailSender(opts.store ?? null);
  const fromName = getDefaultFromName();
  const result = await sendViaResend({
    sender: { from: sender.from, replyTo: sender.replyTo },
    to: opts.to,
    subject: `${fromName} — Nomor PK ${opts.pkNo} (ambil sendiri)`,
    html: buildPkReadyEmailHtml(opts),
    text: buildPkReadyEmailText(opts),
  });
  return { to: result.to, id: result.id };
}
