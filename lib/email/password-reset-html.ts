export function buildPasswordResetEmailHtml(opts: {
  resetUrl: string;
  userName?: string;
}): string {
  const greeting = opts.userName?.trim()
    ? `Halo <strong>${opts.userName}</strong>,`
    : "Halo,";
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;">
  <table width="100%" style="max-width:480px;margin:0 auto;">
    <tr><td style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4f46e5;">Reset kata sandi</p>
      <p style="margin:0 0 16px;font-size:15px;color:#334155;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5;">
        Kami menerima permintaan reset kata sandi akun SERBA ERP Anda. Klik tombol di bawah (berlaku 1 jam):
      </p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${opts.resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:8px;">
          Atur kata sandi baru
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all;">${opts.resetUrl}</p>
      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">Jika Anda tidak meminta ini, abaikan email ini.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetEmailText(resetUrl: string): string {
  return [
    "Reset kata sandi SERBA ERP",
    "",
    "Buka link berikut (berlaku 1 jam):",
    resetUrl,
    "",
    "Jika Anda tidak meminta reset, abaikan email ini.",
  ].join("\n");
}
