import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { verifyPasswordResetToken } from "@/lib/email/password-reset-token";

type Body = {
  token?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const { token, password } = (await req.json()) as Body;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Token wajib" }, { status: 400 });
    }
    const pwd = password?.trim() ?? "";
    if (pwd.length < 8) {
      return NextResponse.json(
        { error: "Kata sandi minimal 8 karakter" },
        { status: 400 },
      );
    }

    const { userId, email } = await verifyPasswordResetToken(token.trim());
    const pb = await getInventoryAdminPb();
    const user = await pb.collection("users").getOne(userId);
    const userEmail =
      typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
    if (userEmail !== email) {
      return NextResponse.json({ error: "Token tidak valid" }, { status: 400 });
    }

    await pb.collection("users").update(userId, {
      password: pwd,
      passwordConfirm: pwd,
    });

    return NextResponse.json({
      ok: true,
      message: "Kata sandi berhasil diubah. Silakan login.",
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Gagal mengatur kata sandi baru";
    const status =
      message.includes("expired") || message.includes("Token")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
