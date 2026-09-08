import { getResendClient } from "@/lib/email/resend";
import type { EmailSender } from "@/lib/email/sender";

export type SendResendEmailInput = {
  sender: EmailSender;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResendEmailResult = {
  id: string;
  to: string;
};

export async function sendViaResend(
  input: SendResendEmailInput,
): Promise<SendResendEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error(
      "Resend belum dikonfigurasi. Set RESEND_API_KEY dan RESEND_FROM_EMAIL di .env.local.",
    );
  }

  const to = input.to.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Email penerima tidak valid");
  }

  const { data, error } = await resend.emails.send({
    from: input.sender.from,
    to: [to],
    replyTo: input.sender.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(error.message || "Resend gagal mengirim email");
  }

  return { id: data?.id ?? "", to };
}
