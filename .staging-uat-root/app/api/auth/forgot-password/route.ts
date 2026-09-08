import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { isResendConfigured } from "@/lib/email/resend";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset-email";

type Body = { email?: string };

/** Respons generik agar tidak bocorkan apakah email terdaftar. */
const GENERIC_OK = {
  ok: true,
  message:
    "Jika email terdaftar, link reset kata sandi telah dikirim. Periksa inbox dan folder spam.",
};

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as Body;
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    }

    if (!isResendConfigured()) {
      return NextResponse.json(
        {
          error: "Layanan email belum dikonfigurasi",
          hint: "Set RESEND_API_KEY, RESEND_FROM_EMAIL, dan PASSWORD_RESET_SECRET di .env.local.",
        },
        { status: 503 },
      );
    }

    try {
      const pb = await getInventoryAdminPb();
      const esc = normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const users = await pb.collection("users").getList(1, 1, {
        filter: `email = "${esc}"`,
      });
      const row = users.items[0] as Record<string, unknown> | undefined;
      const userId = typeof row?.id === "string" ? row.id : undefined;
      const userEmail =
        typeof row?.email === "string" ? row.email.trim().toLowerCase() : "";

      if (userId && userEmail) {
        await sendPasswordResetEmail({
          userId,
          email: normalized,
          userName: typeof row?.name === "string" ? row.name : undefined,
          req,
        });
      }
    } catch (e) {
      console.error("forgot-password:", e);
    }

    return NextResponse.json(GENERIC_OK);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Gagal memproses permintaan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
