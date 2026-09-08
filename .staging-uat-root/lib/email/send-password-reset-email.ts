import { getAppBaseUrl, isResendConfigured } from "@/lib/email/resend";
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
} from "@/lib/email/password-reset-html";
import { createPasswordResetToken } from "@/lib/email/password-reset-token";
import { getDefaultFromName, resolveEmailSender } from "@/lib/email/sender";
import { sendViaResend } from "@/lib/email/send-via-resend";

export async function sendPasswordResetEmail(opts: {
  userId: string;
  email: string;
  userName?: string;
  req?: Request;
}): Promise<{ to: string; id: string }> {
  if (!isResendConfigured()) {
    throw new Error(
      "Resend belum dikonfigurasi. Set RESEND_API_KEY dan RESEND_FROM_EMAIL di .env.local.",
    );
  }

  const token = await createPasswordResetToken(opts.userId, opts.email);
  const baseUrl = getAppBaseUrl(opts.req);
  const resetUrl = `${baseUrl}/login/reset-password?token=${encodeURIComponent(token)}`;

  const sender = resolveEmailSender(null);
  const fromName = getDefaultFromName();

  const result = await sendViaResend({
    sender: {
      from: sender.from,
      replyTo: sender.replyTo,
    },
    to: opts.email,
    subject: `${fromName} — Reset kata sandi`,
    html: buildPasswordResetEmailHtml({ resetUrl, userName: opts.userName }),
    text: buildPasswordResetEmailText(resetUrl),
  });

  return { to: result.to, id: result.id };
}
